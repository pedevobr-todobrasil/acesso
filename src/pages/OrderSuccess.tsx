import { CheckCircle2, Clock3, Copy, MessageCircle, PackageCheck, Truck, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { formatBRL } from '../lib/format'
import { expireAutomaticPixPayment, getPublicOrderTracking } from '../lib/pedevoApi'

type LastOrder = {
  id?: string
  trackingToken?: string
  orderNumber?: number | string | null
  total?: number
  orderType?: string
  paymentMethod?: string
  customerName?: string
  storeName?: string
  storeWhatsapp?: string
  storeSlug?: string
  storePrimaryColor?: string
  pixAutoEnabled?: boolean
  pixSetupError?: string
  pixCopyPaste?: string
  pixQrCodeBase64?: string
  paymentExpiresAt?: string
  paymentStatus?: string
}

type TrackingState = {
  id: string
  order_number?: number | null
  status: string
  payment_method: string
  payment_status?: string
  payment_expires_at?: string | null
  pix_copy_paste?: string | null
  pix_qr_code_base64?: string | null
  total: number
  subtotal?: number
  delivery_fee?: number
  order_type: string
  delivery_address?: any
  notes?: string | null
  store?: { name?: string; whatsapp?: string; slug?: string; primary_color?: string }
  customer?: { name?: string; whatsapp?: string }
  items?: Array<{ product_name: string; quantity: number; unit_price: number; total: number }>
}

function paymentLabel(value?: string) {
  if (value === 'pix') return 'Pix'
  if (value === 'cash') return 'Dinheiro'
  if (value === 'card_on_delivery') return 'Cartão na entrega/retirada'
  return value || 'Não informado'
}

function orderStatusText(order?: TrackingState | null) {
  if (!order) return { title: 'Pedido recebido', description: 'A loja recebeu sua solicitação.' }
  if (order.payment_status === 'expired' || order.payment_status === 'cancelled' || order.status === 'cancelled') return { title: 'Pedido cancelado', description: 'O prazo do pagamento terminou ou o pedido foi cancelado.' }
  if (order.status === 'out_for_delivery') return { title: 'Seu pedido saiu para entrega!', description: 'O entregador já está a caminho do endereço informado.' }
  if (order.status === 'ready' && order.order_type === 'pickup') return { title: 'Pedido pronto para retirada!', description: 'Seu pedido já pode ser retirado na loja.' }
  if (order.payment_method === 'pix' && order.payment_status === 'paid') return { title: 'Pagamento confirmado!', description: 'Seu Pix foi confirmado. Estamos preparando seu pedido.' }
  if (order.status === 'completed') return { title: 'Pedido finalizado', description: 'Obrigado por comprar com esta loja.' }
  if (order.payment_method === 'pix' && ['pending','manual_pending'].includes(String(order.payment_status))) return { title: 'Aguardando pagamento Pix', description: 'Pague pelo QR Code ou Pix Copia e Cola abaixo.' }
  return { title: 'Obrigado pelo seu pedido!', description: 'A loja recebeu sua solicitação e poderá confirmar detalhes pelo WhatsApp.' }
}

function formatRemaining(target?: string | null) {
  if (!target) return '--:--'
  const remaining = Math.max(0, new Date(target).getTime() - Date.now())
  const seconds = Math.floor(remaining / 1000)
  const min = String(Math.floor(seconds / 60)).padStart(2, '0')
  const sec = String(seconds % 60).padStart(2, '0')
  return `${min}:${sec}`
}

export default function OrderSuccess() {
  let lastOrder: LastOrder = {}
  try { lastOrder = JSON.parse(localStorage.getItem('pedevo-last-order') || '{}') } catch { /* noop */ }

  const [tracking, setTracking] = useState<TrackingState | null>(null)
  const [loading, setLoading] = useState(Boolean(lastOrder.id && lastOrder.trackingToken))
  const [copyDone, setCopyDone] = useState(false)
  const [expiryRequested, setExpiryRequested] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    let active = true
    let refreshing = false

    async function refresh() {
      if (refreshing) return
      if (!lastOrder.id || !lastOrder.trackingToken) { setLoading(false); return }
      refreshing = true
      try {
        const result = await getPublicOrderTracking(lastOrder.id, lastOrder.trackingToken)
        if (!active) return
        if (!result.error && result.data) {
          const next = result.data as TrackingState
          setTracking(next)

          // Mantém o snapshot local sincronizado. Isso evita que um refresh da
          // página volte a exibir um status antigo enquanto o pedido já mudou.
          try {
            const cached = JSON.parse(localStorage.getItem('pedevo-last-order') || '{}')
            localStorage.setItem('pedevo-last-order', JSON.stringify({
              ...cached,
              paymentStatus: next.payment_status || cached.paymentStatus,
              paymentExpiresAt: next.payment_expires_at || cached.paymentExpiresAt,
              pixCopyPaste: next.pix_copy_paste || cached.pixCopyPaste,
              pixQrCodeBase64: next.pix_qr_code_base64 || cached.pixQrCodeBase64,
              orderNumber: next.order_number ?? cached.orderNumber,
              total: next.total ?? cached.total,
              orderType: next.order_type || cached.orderType,
              storeName: next.store?.name || cached.storeName,
              storeWhatsapp: next.store?.whatsapp || cached.storeWhatsapp,
              storeSlug: next.store?.slug || cached.storeSlug,
              storePrimaryColor: next.store?.primary_color || cached.storePrimaryColor,
            }))
          } catch { /* noop */ }
        } else if (result.error) {
          console.warn('Não foi possível atualizar o acompanhamento do pedido:', result.error)
        }
      } finally {
        refreshing = false
        if (active) setLoading(false)
      }
    }

    const handleFocus = () => { void refresh() }
    const handleVisibility = () => { if (document.visibilityState === 'visible') void refresh() }

    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 2000)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [lastOrder.id, lastOrder.trackingToken])

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const storeName = tracking?.store?.name || lastOrder.storeName || 'estabelecimento'
  const storeWhatsapp = tracking?.store?.whatsapp || lastOrder.storeWhatsapp || ''
  const storeSlug = tracking?.store?.slug || lastOrder.storeSlug || ''
  const storeColor = tracking?.store?.primary_color || lastOrder.storePrimaryColor || '#ff5a1f'
  const total = Number(tracking?.total ?? lastOrder.total ?? 0)
  const orderType = tracking?.order_type || lastOrder.orderType || 'delivery'
  const orderNumber = tracking?.order_number || lastOrder.orderNumber
  const displayId = orderNumber ? `#${orderNumber}` : lastOrder.id ? `#${String(lastOrder.id).slice(0,8).toUpperCase()}` : '#PEDIDO'
  const stateText = orderStatusText(tracking || ({
    id: lastOrder.id || '',
    status: lastOrder.paymentStatus === 'paid' ? 'preparing' : 'pending',
    payment_method: lastOrder.paymentMethod || '',
    payment_status: lastOrder.paymentStatus,
    payment_expires_at: lastOrder.paymentExpiresAt || null,
    pix_copy_paste: lastOrder.pixCopyPaste || null,
    pix_qr_code_base64: lastOrder.pixQrCodeBase64 || null,
    total: Number(lastOrder.total || 0),
    order_type: lastOrder.orderType || 'delivery',
  } as TrackingState))
  const brandStyle = { '--store-color': storeColor } as CSSProperties
  const effectivePaymentMethod = tracking?.payment_method || lastOrder.paymentMethod || ''
  const effectivePaymentStatus = tracking?.payment_status || lastOrder.paymentStatus || ''
  const effectiveExpiresAt = tracking?.payment_expires_at || lastOrder.paymentExpiresAt || ''
  const effectivePixCopyPaste = tracking?.pix_copy_paste || lastOrder.pixCopyPaste || ''
  const effectivePixQrCode = tracking?.pix_qr_code_base64 || lastOrder.pixQrCodeBase64 || ''
  const isPixPending = effectivePaymentMethod === 'pix' && ['pending','manual_pending'].includes(String(effectivePaymentStatus))
  const isManualPixPending = effectivePaymentMethod === 'pix' && effectivePaymentStatus === 'manual_pending'
  const isPixPaid = effectivePaymentMethod === 'pix' && effectivePaymentStatus === 'paid'
  const isExpired = effectivePaymentStatus === 'expired' || effectivePaymentStatus === 'cancelled' || tracking?.status === 'cancelled'
  const remaining = formatRemaining(effectiveExpiresAt)
  const expiredByClock = Boolean(isPixPending && effectiveExpiresAt && new Date(effectiveExpiresAt).getTime() <= Date.now())

  useEffect(() => {
    if (!expiredByClock || expiryRequested || !lastOrder.id || !lastOrder.trackingToken) return
    setExpiryRequested(true)
    void expireAutomaticPixPayment(lastOrder.id, lastOrder.trackingToken)
  }, [expiredByClock, expiryRequested, lastOrder.id, lastOrder.trackingToken])

  const detailedWhatsappText = useMemo(() => {
    const lines = [
      `Olá, ${storeName}!`,
      `Acabei de fazer o pedido ${displayId} pelo Pedevo.`,
      '',
      `Cliente: ${tracking?.customer?.name || lastOrder.customerName || 'Cliente'}`,
      `Recebimento: ${orderType === 'pickup' ? 'Retirada' : 'Delivery'}`,
      `Pagamento: ${paymentLabel(tracking?.payment_method || lastOrder.paymentMethod)}`,
    ]
    if (tracking?.items?.length) {
      lines.push('', 'Itens do pedido:')
      tracking.items.forEach((item) => lines.push(`- ${item.quantity}x ${item.product_name} — ${formatBRL(Number(item.total || 0))}`))
    }
    if (tracking?.subtotal != null) lines.push('', `Subtotal: ${formatBRL(Number(tracking.subtotal))}`)
    if (tracking?.delivery_fee != null && Number(tracking.delivery_fee) > 0) lines.push(`Entrega: ${formatBRL(Number(tracking.delivery_fee))}`)
    lines.push(`Total: ${formatBRL(total)}`)
    if (tracking?.delivery_address && orderType === 'delivery') {
      const a = tracking.delivery_address
      lines.push('', 'Endereço:')
      lines.push(`${a.street || ''}, ${a.number || 's/n'}${a.complement ? ` - ${a.complement}` : ''}`)
      lines.push(`${a.neighborhood || ''} - ${a.city || ''}/${a.state || ''} - CEP ${a.cep || ''}`)
      if (a.reference) lines.push(`Referência: ${a.reference}`)
    }
    if (tracking?.notes) lines.push('', `Observações: ${tracking.notes}`)
    return lines.join('\n')
  }, [tracking, storeName, displayId, orderType, total])

  async function copyPix() {
    if (!effectivePixCopyPaste) return
    try {
      await navigator.clipboard.writeText(effectivePixCopyPaste)
      setCopyDone(true)
      window.setTimeout(() => setCopyDone(false), 1800)
    } catch { setCopyDone(false) }
  }

  const rawWhatsapp = String(storeWhatsapp).replace(/\D/g, '')
  const whatsapp = rawWhatsapp && !rawWhatsapp.startsWith('55') && [10,11].includes(rawWhatsapp.length) ? `55${rawWhatsapp}` : rawWhatsapp
  const whatsappUrl = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(detailedWhatsappText)}` : ''
  const receiptWhatsappText = `${detailedWhatsappText}\n\nSegue o comprovante do Pix deste pedido. Vou anexar a imagem nesta conversa.`
  const receiptWhatsappUrl = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(receiptWhatsappText)}` : ''
  const storeUrl = storeSlug ? `/loja/${storeSlug}` : '/'

  return <div className="successPage customerFlowPage" style={brandStyle}>
    <div className="successCard orderTrackingCard">
      <div className={isExpired ? 'successIcon expired' : isPixPaid || tracking?.status === 'completed' ? 'successIcon paid' : 'successIcon'}>
        {isExpired ? <XCircle/> : tracking?.status === 'out_for_delivery' ? <Truck/> : isPixPaid ? <CheckCircle2/> : <PackageCheck/>}
      </div>
      <span>{isPixPaid ? 'PAGAMENTO CONFIRMADO' : tracking?.status === 'out_for_delivery' ? 'SAIU PARA ENTREGA' : isExpired ? 'PEDIDO CANCELADO' : 'PEDIDO RECEBIDO'}</span>
      <h1>{stateText.title}</h1>
      <p>{stateText.description}</p>

      <div className="successOrder">
        <div><span>Pedido</span><strong>{displayId}</strong></div>
        <div><span>Total</span><strong>{formatBRL(total)}</strong></div>
        <div><span>Recebimento</span><strong>{orderType === 'pickup' ? 'Retirada' : 'Delivery'}</strong></div>
      </div>

      {lastOrder.pixSetupError && !effectivePixQrCode && <div className="pixPaymentError"><strong>Não foi possível gerar o Pix.</strong><span>{lastOrder.pixSetupError}</span></div>}

      {isPixPending && !expiredByClock && <section className="pixPaymentPanel">
        <div className="pixTimer"><Clock3/><div><span>Tempo para pagar</span><strong>{remaining}</strong></div></div>
        {effectivePixQrCode && <img className="pixQrImage" src={effectivePixQrCode.startsWith('data:') ? effectivePixQrCode : `data:image/png;base64,${effectivePixQrCode}`} alt="QR Code Pix"/>}
        <div className="pixCopyArea"><label>Pix Copia e Cola</label><div><input readOnly value={effectivePixCopyPaste}/><button onClick={copyPix}><Copy size={17}/>{copyDone ? 'Copiado!' : 'Copiar'}</button></div></div>
        <small>{isManualPixPending ? 'No modo manual, o Pedevo não recebe confirmação do banco. Pague dentro do prazo, envie o comprovante e aguarde a loja marcar o pedido como pago.' : 'O Pedevo acompanha a confirmação do pagamento automaticamente. Esta tela será atualizada assim que o Pix for aprovado.'}</small>
        {isManualPixPending && receiptWhatsappUrl && <a className="button large full receiptWhatsappButton" target="_blank" rel="noreferrer" href={receiptWhatsappUrl}><MessageCircle size={19}/> Enviar comprovante pelo WhatsApp</a>}
      </section>}

      {(isExpired || expiredByClock) && effectivePaymentMethod === 'pix' && <div className="pixExpiredPanel"><XCircle/><div><strong>Prazo do Pix encerrado</strong><span>Este pedido não deve mais ser pago. Faça um novo pedido para gerar outro QR Code.</span></div></div>}

      {isPixPaid && <div className="pixPaidPanel"><CheckCircle2/><div><strong>Pix aprovado</strong><span>Pagamento confirmado. Estamos preparando seu pedido.</span></div></div>}

      {tracking?.status === 'out_for_delivery' && <div className="deliveryTrackingPanel"><Truck/><div><strong>Pedido a caminho</strong><span>A loja marcou seu pedido como “Saiu para entrega”.</span></div></div>}

      {loading && <div className="trackingLoading">Atualizando o pedido...</div>}
      {whatsappUrl && <a className="button large full" target="_blank" rel="noreferrer" href={whatsappUrl}><MessageCircle size={19}/> Falar com a loja no WhatsApp</a>}
      <Link to={storeUrl} className="textLink">Voltar para a loja</Link>
    </div>
  </div>
}
