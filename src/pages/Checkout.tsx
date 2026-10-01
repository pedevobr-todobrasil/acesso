import { ArrowLeft, CheckCircle2, CreditCard, LoaderCircle, MapPin, PackageCheck, Search, ShoppingBag, Truck } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { lookupCep, normalizePlace } from '../lib/cep'
import { formatBRL } from '../lib/format'
import { createAutomaticPixPayment, createManualPixPayment, getStoreOrderingStatus, placeOrder, sendOrderWhatsapp } from '../lib/pedevoApi'
import { isStoreOpenNow } from '../lib/storeHours'

type PaymentMethod = 'pix' | 'cash' | 'card_on_delivery'
type AddressState = { cep:string; street:string; number:string; neighborhood:string; city:string; state:string; complement:string; reference:string }

function formatCep(value:string) {
  const digits = value.replace(/\D/g,'').slice(0,8)
  return digits.length > 5 ? `${digits.slice(0,5)}-${digits.slice(5)}` : digits
}

export default function Checkout() {
  const navigate = useNavigate()
  const { items, store, subtotal, hasAgeRestrictedItem, clearCart } = useCart()
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>(() => store?.deliveryEnabled ? 'delivery' : 'pickup')
  const [payment, setPayment] = useState<PaymentMethod>(() => store?.pixEnabled ? 'pix' : store?.cashEnabled ? 'cash' : 'card_on_delivery')
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [cashChange, setCashChange] = useState('')
  const [pixCopied, setPixCopied] = useState(false)
  const [orderingAllowed, setOrderingAllowed] = useState<boolean | null>(null)
  const [orderingMessage, setOrderingMessage] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [cepMessage, setCepMessage] = useState('')
  const [address, setAddress] = useState<AddressState>({ cep:'', street:'', number:'', neighborhood:'', city:store?.city || '', state:store?.state || '', complement:'', reference:'' })

  useEffect(() => {
    if (!store) return
    setAddress((current) => ({ ...current, city: current.city || store.city || '', state: current.state || store.state || '' }))
    if (orderType === 'delivery' && !store.deliveryEnabled && store.pickupEnabled) setOrderType('pickup')
    if (orderType === 'pickup' && !store.pickupEnabled && store.deliveryEnabled) setOrderType('delivery')
    const paymentAvailable = (payment === 'pix' && store.pixEnabled) || (payment === 'cash' && store.cashEnabled) || (payment === 'card_on_delivery' && store.cardOnDeliveryEnabled)
    if (!paymentAvailable) {
      if (store.pixEnabled) setPayment('pix')
      else if (store.cashEnabled) setPayment('cash')
      else if (store.cardOnDeliveryEnabled) setPayment('card_on_delivery')
    }
  }, [store, orderType, payment])

  useEffect(() => {
    let mounted = true
    async function checkAvailability() {
      if (!store) { setOrderingAllowed(null); return }
      const result = await getStoreOrderingStatus(store.id)
      if (!mounted) return
      if (result.error) { setOrderingAllowed(false); setOrderingMessage('Não foi possível validar a disponibilidade da loja.') }
      else { setOrderingAllowed(Boolean(result.data?.can_order)); setOrderingMessage(result.data?.message || '') }
    }
    checkAvailability()
    return () => { mounted = false }
  }, [store?.id])

  const deliveryZones = store?.deliveryZones?.filter((zone) => zone.active) || []
  const selectedZone = deliveryZones.find((zone) => zone.id === selectedZoneId) || null
  const storeOpenNow = store ? isStoreOpenNow(store.open, store.openingHours, store.timezone) : false
  const cityMatches = !store?.city || normalizePlace(address.city) === normalizePlace(store.city)
  const stateMatches = !store?.state || normalizePlace(address.state) === normalizePlace(store.state)
  const serviceAreaValid = cityMatches && stateMatches
  const deliveryFee = orderType === 'delivery' ? (selectedZone?.fee ?? (store?.deliveryFee || 0)) : 0
  const total = subtotal + deliveryFee
  const meetsMinimum = subtotal >= (store?.minOrder || 0)
  const baseAddressReady = address.cep.replace(/\D/g,'').length === 8 && Boolean(address.street.trim() && address.number.trim() && address.neighborhood.trim() && address.city.trim() && address.state.trim())
  const deliveryReady = orderType !== 'delivery' || (baseAddressReady && serviceAreaValid)
  const canSubmit = useMemo(() => Boolean(store) && storeOpenNow && orderingAllowed !== false && items.length > 0 && meetsMinimum && deliveryReady && (!hasAgeRestrictedItem || ageConfirmed), [store, storeOpenNow, orderingAllowed, items.length, meetsMinimum, deliveryReady, hasAgeRestrictedItem, ageConfirmed])

  useEffect(() => {
    if (!address.neighborhood.trim()) { setSelectedZoneId(''); return }
    const target = normalizePlace(address.neighborhood)
    const exact = deliveryZones.find((zone) => normalizePlace(zone.name) === target)
    setSelectedZoneId(exact?.id || '')
  }, [address.neighborhood, deliveryZones.length])

  function parseMoney(value: string) {
    const normalized = value.trim().replace(/\./g, '').replace(',', '.')
    const number = Number(normalized)
    return Number.isFinite(number) ? number : 0
  }

  async function searchCep() {
    if (orderType !== 'delivery') return
    setCepMessage('')
    const digits = address.cep.replace(/\D/g,'')
    if (digits.length !== 8) { setCepMessage('Digite um CEP válido com 8 números.'); return }
    setCepLoading(true)
    try {
      const result = await lookupCep(digits)
      const next = {
        ...address,
        cep: result.cep,
        street: result.street || address.street,
        neighborhood: result.neighborhood || address.neighborhood,
        city: result.city || store?.city || address.city,
        state: result.state || store?.state || address.state,
        complement: result.complement || address.complement,
      }
      setAddress(next)
      const outsideArea = Boolean((store?.city && normalizePlace(next.city) !== normalizePlace(store.city)) || (store?.state && normalizePlace(next.state) !== normalizePlace(store.state)))
      if (outsideArea) {
        setCepMessage(`Este CEP é de ${next.city}/${next.state}. Esta loja atende delivery em ${store?.city || 'sua cidade'}${store?.state ? `/${store.state}` : ''}.`)
        setSelectedZoneId('')
      } else {
        const target = normalizePlace(next.neighborhood)
        const zone = deliveryZones.find((item) => normalizePlace(item.name) === target)
        setSelectedZoneId(zone?.id || '')
        if (zone) {
          setCepMessage(`Endereço encontrado. Para ${zone.name}, a taxa de entrega é ${formatBRL(zone.fee)}.`)
        } else if (next.neighborhood) {
          setCepMessage(`Endereço encontrado. O bairro “${next.neighborhood}” não tem taxa específica; será usada a taxa padrão de ${formatBRL(store?.deliveryFee || 0)}.`)
        } else {
          setCepMessage(`Endereço encontrado. A taxa padrão de ${formatBRL(store?.deliveryFee || 0)} será usada quando o bairro não tiver uma taxa específica.`)
        }
      }
    } catch (err:any) {
      setCepMessage(err?.message || 'Não foi possível consultar o CEP.')
    } finally { setCepLoading(false) }
  }

  async function copyPixKey() {
    if (!store?.pixKey) return
    try { await navigator.clipboard.writeText(store.pixKey); setPixCopied(true); window.setTimeout(() => setPixCopied(false), 1800) }
    catch { setPixCopied(false) }
  }

  async function finishOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || !store) return
    setSubmitting(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const deliveryAddress = orderType === 'delivery' ? {
      cep: address.cep.trim(),
      street: address.street.trim(),
      number: address.number.trim(),
      neighborhood: address.neighborhood.trim(),
      city: address.city.trim(),
      state: address.state.trim().toUpperCase(),
      complement: address.complement.trim(),
      reference: address.reference.trim(),
      delivery_zone: selectedZone?.name || address.neighborhood.trim(),
    } : null

    const observations = String(form.get('notes') || '').trim()
    let orderNotes = observations
    if (payment === 'cash' && cashChange.trim()) {
      const changeValue = parseMoney(cashChange)
      if (changeValue > 0 && changeValue < total) { setError(`O valor para troco deve ser igual ou maior que ${formatBRL(total)}.`); setSubmitting(false); return }
      if (changeValue > 0) orderNotes = observations ? `Troco para ${formatBRL(changeValue)}. ${observations}` : `Troco para ${formatBRL(changeValue)}`
    }

    const freshStatus = await getStoreOrderingStatus(store.id)
    if (freshStatus.error || !freshStatus.data?.can_order) {
      setOrderingAllowed(false)
      setOrderingMessage(freshStatus.data?.message || 'Esta loja está temporariamente indisponível para novos pedidos.')
      setError(freshStatus.data?.message || 'Esta loja está temporariamente indisponível para novos pedidos.')
      setSubmitting(false)
      return
    }

    const customerName = String(form.get('name') || '').trim()
    const customerWhatsapp = String(form.get('whatsapp') || '').trim()
    const customerEmail = String(form.get('email') || '').trim()
    const payerDocument = String(form.get('payer_document') || '').replace(/\D/g, '')

    if (payment === 'pix' && store.pixAutoEnabled) {
      if (!customerEmail || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
        setError('Informe um e-mail válido para gerar o Pix automático.')
        setSubmitting(false)
        return
      }
      if (payerDocument.length !== 11) {
        setError('Informe um CPF com 11 números para gerar o Pix automático.')
        setSubmitting(false)
        return
      }
    }

    const result = await placeOrder({
      storeId: store.id,
      customerName,
      customerWhatsapp,
      customerEmail,
      orderType,
      paymentMethod: payment,
      deliveryAddress,
      deliveryZoneId: orderType === 'delivery' ? (selectedZone?.id || null) : null,
      notes: orderNotes,
      ageConfirmed,
      items: items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
    })

    if (result.error || !result.data) { setError(result.error?.message || 'Não foi possível enviar o pedido. Tente novamente.'); setSubmitting(false); return }

    const payload: any = result.data
    const orderId = String(payload.order_id || payload.id || payload)
    const trackingToken = String(payload.tracking_token || '')
    const orderNumber = payload.order_number || null

    let pixSetupError = ''
    let pixCopyPaste = ''
    let pixQrCodeBase64 = ''
    let paymentExpiresAt = ''
    let paymentStatus = payment === 'pix' ? 'manual_pending' : 'not_required'
    if (payment === 'pix' && trackingToken) {
      if (store.pixAutoEnabled) {
        const pixResult = await createAutomaticPixPayment({ orderId, trackingToken, payerEmail: customerEmail, payerDocument })
        if (pixResult.error) {
          pixSetupError = pixResult.error.message || 'Não foi possível gerar o Pix automático.'
          void sendOrderWhatsapp({ orderId, trackingToken, event: 'order_received' })
        } else {
          const pixData: any = pixResult.data || {}
          pixCopyPaste = String(pixData.pixCopyPaste || pixData.qr_code || '')
          pixQrCodeBase64 = String(pixData.qrCodeBase64 || pixData.qr_code_base64 || '')
          paymentExpiresAt = String(pixData.expiresAt || pixData.expirationDate || '')
          paymentStatus = 'pending'
        }
      } else {
        const pixResult = await createManualPixPayment({ orderId, trackingToken })
        if (pixResult.error) {
          pixSetupError = pixResult.error.message || 'Não foi possível gerar o QR Code Pix manual.'
        } else {
          const pixData: any = pixResult.data || {}
          pixCopyPaste = String(pixData.pixCopyPaste || '')
          pixQrCodeBase64 = String(pixData.qrCodeBase64 || '')
          paymentExpiresAt = String(pixData.expiresAt || '')
          paymentStatus = 'manual_pending'
        }
        void sendOrderWhatsapp({ orderId, trackingToken, event: 'order_received' })
      }
    } else if (trackingToken) {
      void sendOrderWhatsapp({ orderId, trackingToken, event: 'order_received' })
    }

    localStorage.setItem('pedevo-last-order', JSON.stringify({
      id: orderId,
      trackingToken,
      orderNumber,
      total: Number(payload.total ?? total),
      orderType,
      paymentMethod: payment,
      customerName,
      storeName: store.name,
      storeWhatsapp: store.whatsapp,
      storeSlug: store.slug,
      storePrimaryColor: store.primaryColor,
      pixAutoEnabled: Boolean(store.pixAutoEnabled),
      pixSetupError,
      pixCopyPaste,
      pixQrCodeBase64,
      paymentExpiresAt,
      paymentStatus,
      createdAt: new Date().toISOString(),
    }))
    clearCart()
    navigate('/pedido-concluido')
  }

  const brandStyle = { '--store-color': store?.primaryColor || '#ff5a1f' } as CSSProperties

  if (!store || items.length === 0) return <div className="checkoutPage customerFlowPage" style={brandStyle}><div className="checkoutShell"><div className="emptyCart"><ShoppingBag size={44}/><h2>Não há pedido para finalizar</h2><p>Volte para uma loja e adicione produtos ao carrinho.</p><Link className="button" to={store ? `/loja/${store.slug}` : '/'}>Voltar para a loja</Link></div></div></div>

  return <div className="checkoutPage customerFlowPage" style={brandStyle}><div className="checkoutShell wideCheckout">
    <header className="checkoutHeader"><Link to="/carrinho"><ArrowLeft/></Link><div><strong>Finalizar pedido</strong><small>{store.name}</small></div></header>
    <form className="checkoutGrid" onSubmit={finishOrder}>
      <div className="checkoutMain">
        {orderingAllowed === false && <div className="subscriptionCheckoutAlert"><strong>Pedidos pausados</strong><span>{orderingMessage || 'Esta loja não está recebendo novos pedidos no momento.'}</span></div>}
        {!storeOpenNow && <div className="subscriptionCheckoutAlert"><strong>Loja fechada neste horário</strong><span>Você pode consultar o cardápio, mas novos pedidos só serão liberados no horário de funcionamento.</span></div>}
        {error && <div className="minimumAlert">{error}</div>}
        <section className="checkoutCard"><div className="cardTitleIcon"><ShoppingBag/><div><h2>Seus dados</h2><p>Usaremos o WhatsApp para falar sobre o pedido.</p></div></div>
          <div className="formGrid two"><label>Nome completo<input name="name" required placeholder="Ex.: João da Silva"/></label><label>WhatsApp<input name="whatsapp" required inputMode="tel" placeholder="(63) 99999-9999"/></label></div>
        </section>

        <section className="checkoutCard"><div className="cardTitleIcon"><Truck/><div><h2>Como deseja receber?</h2><p>{store.city ? `Delivery limitado a ${store.city}${store.state ? `/${store.state}` : ''}.` : 'Escolha entrega ou retirada.'}</p></div></div>
          <div className="choiceGrid">
            {store.deliveryEnabled && <button type="button" onClick={() => setOrderType('delivery')} className={orderType === 'delivery' ? 'choiceCard selected' : 'choiceCard'}><Truck/><div><strong>Delivery</strong><span>Receber no endereço</span></div>{orderType === 'delivery' && <CheckCircle2/>}</button>}
            {store.pickupEnabled && <button type="button" onClick={() => setOrderType('pickup')} className={orderType === 'pickup' ? 'choiceCard selected' : 'choiceCard'}><PackageCheck/><div><strong>Retirada</strong><span>Buscar na loja</span></div>{orderType === 'pickup' && <CheckCircle2/>}</button>}
          </div>
          {orderType === 'delivery' && <div className="addressFields deliveryAddressV14">
            <div className="cepLookupRow"><label>CEP<div className="inputActionWrap"><input value={address.cep} onChange={(e)=>setAddress({...address,cep:formatCep(e.target.value)})} onBlur={()=>address.cep.replace(/\D/g,'').length===8 && searchCep()} required placeholder="00000-000"/><button type="button" onClick={searchCep} disabled={cepLoading}>{cepLoading ? <LoaderCircle className="spin" size={17}/> : <Search size={17}/>} Buscar</button></div></label><div className="serviceAreaCard"><span>Área de atendimento</span><strong>{store.city || 'Cidade não configurada'}{store.state ? `/${store.state}` : ''}</strong></div></div>
            {cepMessage && <div className={serviceAreaValid ? 'cepLookupMessage' : 'cepLookupMessage error'}>{cepMessage}</div>}
            <div className="formGrid two"><label>Rua / Avenida<input value={address.street} onChange={(e)=>setAddress({...address,street:e.target.value})} required placeholder="Nome da rua"/></label><label>Número<input value={address.number} onChange={(e)=>setAddress({...address,number:e.target.value})} required placeholder="123"/></label></div>
            <div className="formGrid two"><label>Bairro<input value={address.neighborhood} onChange={(e)=>setAddress({...address,neighborhood:e.target.value})} required placeholder="Bairro"/></label><label>Complemento <small>(opcional)</small><input value={address.complement} onChange={(e)=>setAddress({...address,complement:e.target.value})} placeholder="Apto, bloco, casa..."/></label></div>
            <div className="formGrid two"><label>Cidade<input value={address.city} onChange={(e)=>setAddress({...address,city:e.target.value})} required placeholder={store.city || 'Cidade'}/></label><label>Estado / UF<input value={address.state} onChange={(e)=>setAddress({...address,state:e.target.value.toUpperCase().slice(0,2)})} required maxLength={2} placeholder={store.state || 'UF'}/></label></div>
            <label>Ponto de referência <small>(opcional, mas ajuda muito o entregador)</small><input value={address.reference} onChange={(e)=>setAddress({...address,reference:e.target.value})} placeholder="Ex.: portão azul, ao lado da farmácia, em frente à praça"/></label>
            {!serviceAreaValid && <div className="areaBlockedNotice"><MapPin size={17}/><div><strong>Endereço fora da área da loja</strong><span>Para delivery, a cidade e o estado precisam ser {store.city}{store.state ? `/${store.state}` : ''}.</span></div></div>}
            {address.neighborhood.trim() && serviceAreaValid && <div className="deliveryZoneNotice"><MapPin size={16}/><div><strong>{selectedZone ? `${selectedZone.name}: ${formatBRL(selectedZone.fee)}` : `Taxa padrão: ${formatBRL(store.deliveryFee || 0)}`}</strong><span>{selectedZone ? (selectedZone.etaMinMinutes != null ? `Prazo estimado: ${selectedZone.etaMinMinutes}${selectedZone.etaMaxMinutes != null ? `–${selectedZone.etaMaxMinutes}` : ''} min` : 'Taxa específica aplicada automaticamente pelo bairro do CEP.') : `O bairro ${address.neighborhood} não tem uma taxa específica cadastrada. A taxa padrão da loja foi aplicada automaticamente.`}</span></div></div>}
          </div>}
        </section>

        <section className="checkoutCard"><div className="cardTitleIcon"><CreditCard/><div><h2>Forma de pagamento</h2><p>Escolha como deseja pagar.</p></div></div>
          <div className="paymentChoices">
            {store.pixEnabled && <label className={payment === 'pix' ? 'paymentChoice selected' : 'paymentChoice'}><input type="radio" name="payment" value="pix" checked={payment === 'pix'} onChange={() => setPayment('pix')}/><span>◈</span><div><strong>Pix</strong><small>{store.pixAutoEnabled ? 'QR Code e confirmação automática' : store.pixKey ? 'Pague pela chave cadastrada pela loja' : 'Combine o Pix com a loja'}</small></div></label>}
            {store.cashEnabled && <label className={payment === 'cash' ? 'paymentChoice selected' : 'paymentChoice'}><input type="radio" name="payment" value="cash" checked={payment === 'cash'} onChange={() => setPayment('cash')}/><span>💵</span><div><strong>Dinheiro</strong><small>Você pode informar o valor para troco</small></div></label>}
            {store.cardOnDeliveryEnabled && <label className={payment === 'card_on_delivery' ? 'paymentChoice selected' : 'paymentChoice'}><input type="radio" name="payment" value="card_on_delivery" checked={payment === 'card_on_delivery'} onChange={() => setPayment('card_on_delivery')}/><span>💳</span><div><strong>Cartão na entrega</strong><small>Débito ou crédito</small></div></label>}
          </div>
          {payment === 'pix' && store.pixEnabled && store.pixAutoEnabled && <div className="pixAutoCheckoutBox"><div><strong>Pix automático</strong><span>Após confirmar o pedido, o Pedevo gera um QR Code e Pix Copia e Cola exclusivo para este pedido.</span></div><div className="formGrid two"><label>E-mail do pagador<input name="email" type="email" required placeholder="voce@email.com"/></label><label>CPF do pagador<input name="payer_document" inputMode="numeric" required maxLength={14} placeholder="000.000.000-00"/></label></div></div>}
          {payment === 'pix' && store.pixEnabled && !store.pixAutoEnabled && <div className="paymentExtraBox manualPixCheckoutInfo"><div><strong>Pix manual com QR Code</strong><span>Depois de confirmar o pedido, o Pedevo gera um QR Code e um Pix Copia e Cola com o valor exato. Você terá 10 minutos para pagar e poderá enviar o comprovante pelo WhatsApp.</span></div></div>}
          {payment === 'cash' && store.cashEnabled && <div className="cashChangeBox"><label>Troco para quanto? <small>(opcional)</small><input value={cashChange} onChange={(e)=>setCashChange(e.target.value)} inputMode="decimal" placeholder={`Ex.: ${Math.ceil(total + 10)},00`}/></label><p>Se não precisar de troco, deixe em branco.</p></div>}
          {payment === 'card_on_delivery' && store.cardOnDeliveryEnabled && <div className="paymentExtraBox"><div><strong>Cartão na entrega/retirada</strong><span>O pagamento será feito na maquininha da loja ou do entregador.</span></div></div>}
          <label>Observações<textarea name="notes" rows={3} placeholder="Ex.: entregar na portaria, produto sem gelo..."/></label>
        </section>

        {hasAgeRestrictedItem && <section className="ageConfirm"><strong>Pedido com bebida alcoólica</strong><label><input type="checkbox" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)}/> Declaro que tenho 18 anos ou mais. A loja poderá solicitar documento na entrega ou retirada.</label></section>}
      </div>

      <aside className="orderSummaryCard"><h2>Resumo do pedido</h2><div className="miniItems">{items.map((item) => <div key={item.product.id}><span>{item.quantity}x {item.product.name}</span><strong>{formatBRL(item.product.price * item.quantity)}</strong></div>)}</div><hr/><div className="summaryLine"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div><div className="summaryLine"><span>Entrega</span><span>{orderType === 'pickup' ? 'Retirada' : deliveryFee === 0 ? 'Grátis' : formatBRL(deliveryFee)}</span></div><div className="summaryTotal"><span>Total</span><strong>{formatBRL(total)}</strong></div><button className="button large full" type="submit" disabled={!canSubmit || submitting}>{submitting ? 'Enviando...' : !storeOpenNow ? 'Loja fechada' : orderingAllowed === false ? 'Pedidos pausados' : 'Confirmar pedido'}</button><small className="secureText"><MapPin size={14}/> Seus dados são usados apenas para concluir este pedido.</small></aside>
    </form>
  </div></div>
}
