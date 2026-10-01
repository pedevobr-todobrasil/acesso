import { ArrowLeft, CheckCircle2, CreditCard, MapPin, PackageCheck, ShoppingBag, Truck } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatBRL } from '../lib/format'
import { getStoreOrderingStatus, placeOrder } from '../lib/pedevoApi'

type PaymentMethod = 'pix' | 'cash' | 'card_on_delivery'

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

  useEffect(() => {
    if (!store) return
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
    async function checkSubscription() {
      if (!store) { setOrderingAllowed(null); return }
      const result = await getStoreOrderingStatus(store.id)
      if (!mounted) return
      if (result.error) { setOrderingAllowed(false); setOrderingMessage('Não foi possível validar a disponibilidade da loja.') }
      else { setOrderingAllowed(Boolean(result.data?.can_order)); setOrderingMessage(result.data?.message || '') }
    }
    checkSubscription()
    return () => { mounted = false }
  }, [store?.id])

  const deliveryZones = store?.deliveryZones?.filter((zone) => zone.active) || []
  const selectedZone = deliveryZones.find((zone) => zone.id === selectedZoneId) || null
  const requiresZone = orderType === 'delivery' && deliveryZones.length > 0
  const deliveryFee = orderType === 'delivery' ? (selectedZone?.fee ?? (deliveryZones.length ? 0 : (store?.deliveryFee || 0))) : 0
  const total = subtotal + deliveryFee
  const meetsMinimum = subtotal >= (store?.minOrder || 0)
  const deliveryReady = orderType !== 'delivery' || !requiresZone || Boolean(selectedZone)
  const canSubmit = useMemo(() => Boolean(store) && orderingAllowed !== false && items.length > 0 && meetsMinimum && deliveryReady && (!hasAgeRestrictedItem || ageConfirmed), [store, orderingAllowed, items.length, meetsMinimum, deliveryReady, hasAgeRestrictedItem, ageConfirmed])

  function parseMoney(value: string) {
    const normalized = value.trim().replace(/\./g, '').replace(',', '.')
    const number = Number(normalized)
    return Number.isFinite(number) ? number : 0
  }

  async function copyPixKey() {
    if (!store?.pixKey) return
    try {
      await navigator.clipboard.writeText(store.pixKey)
      setPixCopied(true)
      window.setTimeout(() => setPixCopied(false), 1800)
    } catch {
      setPixCopied(false)
    }
  }

  async function finishOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || !store) return
    setSubmitting(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const deliveryAddress = orderType === 'delivery' ? {
      cep: String(form.get('cep') || '').trim(),
      neighborhood: selectedZone?.name || String(form.get('neighborhood') || '').trim(),
      street: String(form.get('street') || '').trim(),
      number: String(form.get('number') || '').trim(),
      complement: String(form.get('complement') || '').trim(),
    } : null

    const observations = String(form.get('notes') || '').trim()
    let orderNotes = observations
    if (payment === 'cash' && cashChange.trim()) {
      const changeValue = parseMoney(cashChange)
      if (changeValue > 0 && changeValue < total) {
        setError(`O valor para troco deve ser igual ou maior que ${formatBRL(total)}.`)
        setSubmitting(false)
        return
      }
      if (changeValue > 0) {
        const changeNote = `Troco para ${formatBRL(changeValue)}`
        orderNotes = observations ? `${changeNote}. ${observations}` : changeNote
      }
    }

    const freshStatus = await getStoreOrderingStatus(store.id)
    if (freshStatus.error || !freshStatus.data?.can_order) {
      setOrderingAllowed(false)
      setOrderingMessage(freshStatus.data?.message || 'Esta loja está temporariamente indisponível para novos pedidos.')
      setError(freshStatus.data?.message || 'Esta loja está temporariamente indisponível para novos pedidos.')
      setSubmitting(false)
      return
    }

    const result = await placeOrder({
      storeId: store.id,
      customerName: String(form.get('name') || '').trim(),
      customerWhatsapp: String(form.get('whatsapp') || '').trim(),
      orderType,
      paymentMethod: payment,
      deliveryAddress,
      deliveryZoneId: orderType === 'delivery' ? (selectedZone?.id || null) : null,
      notes: orderNotes,
      ageConfirmed,
      items: items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
    })

    if (result.error || !result.data) {
      setError(result.error?.message || 'Não foi possível enviar o pedido. Tente novamente.')
      setSubmitting(false)
      return
    }

    const orderId = typeof result.data === 'string' ? result.data : String(result.data)
    localStorage.setItem('pedevo-last-order', JSON.stringify({
      id: orderId,
      total,
      orderType,
      storeName: store.name,
      storeWhatsapp: store.whatsapp,
      storeSlug: store.slug,
      storePrimaryColor: store.primaryColor,
      createdAt: new Date().toISOString(),
    }))
    clearCart()
    navigate('/pedido-concluido')
  }

  const brandStyle = { '--store-color': store?.primaryColor || '#ff5a1f' } as CSSProperties

  if (!store || items.length === 0) {
    return <div className="checkoutPage customerFlowPage" style={brandStyle}><div className="checkoutShell"><div className="emptyCart"><ShoppingBag size={44}/><h2>Não há pedido para finalizar</h2><p>Volte para uma loja e adicione produtos ao carrinho.</p><Link className="button" to={store ? `/loja/${store.slug}` : '/'}>Voltar para a loja</Link></div></div></div>
  }

  return <div className="checkoutPage customerFlowPage" style={brandStyle}><div className="checkoutShell wideCheckout">
    <header className="checkoutHeader"><Link to="/carrinho"><ArrowLeft/></Link><div><strong>Finalizar pedido</strong><small>{store.name}</small></div></header>
    <form className="checkoutGrid" onSubmit={finishOrder}>
      <div className="checkoutMain">
        {orderingAllowed === false && <div className="subscriptionCheckoutAlert"><strong>Pedidos pausados</strong><span>{orderingMessage || 'Esta loja não está recebendo novos pedidos no momento.'}</span></div>}
        {error && <div className="minimumAlert">{error}</div>}
        <section className="checkoutCard"><div className="cardTitleIcon"><ShoppingBag/><div><h2>Seus dados</h2><p>Usaremos o WhatsApp para falar sobre o pedido.</p></div></div>
          <div className="formGrid two"><label>Nome completo<input name="name" required placeholder="Ex.: João da Silva"/></label><label>WhatsApp<input name="whatsapp" required inputMode="tel" placeholder="(63) 99999-9999"/></label></div>
        </section>

        <section className="checkoutCard"><div className="cardTitleIcon"><Truck/><div><h2>Como deseja receber?</h2><p>Escolha entrega ou retirada.</p></div></div>
          <div className="choiceGrid">
            {store.deliveryEnabled && <button type="button" onClick={() => setOrderType('delivery')} className={orderType === 'delivery' ? 'choiceCard selected' : 'choiceCard'}><Truck/><div><strong>Delivery</strong><span>Receber no endereço</span></div>{orderType === 'delivery' && <CheckCircle2/>}</button>}
            {store.pickupEnabled && <button type="button" onClick={() => setOrderType('pickup')} className={orderType === 'pickup' ? 'choiceCard selected' : 'choiceCard'}><PackageCheck/><div><strong>Retirada</strong><span>Buscar na loja</span></div>{orderType === 'pickup' && <CheckCircle2/>}</button>}
          </div>
          {orderType === 'delivery' && <div className="addressFields">
            <div className="formGrid two">
              <label>CEP<input name="cep" required placeholder="00000-000"/></label>
              {deliveryZones.length > 0 ? <label>Bairro / região<select name="delivery_zone" value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)} required><option value="">Selecione seu bairro...</option>{deliveryZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name} — {formatBRL(zone.fee)}</option>)}</select></label> : <label>Bairro<input name="neighborhood" required placeholder="Seu bairro"/></label>}
            </div>
            {selectedZone && <div className="deliveryZoneNotice"><MapPin size={16}/><div><strong>{selectedZone.name}: {formatBRL(selectedZone.fee)}</strong>{selectedZone.etaMinMinutes != null && <span>Prazo estimado: {selectedZone.etaMinMinutes}{selectedZone.etaMaxMinutes != null ? `–${selectedZone.etaMaxMinutes}` : ''} min</span>}</div></div>}
            <label>Rua / Avenida<input name="street" required placeholder="Nome da rua"/></label><div className="formGrid two"><label>Número<input name="number" required placeholder="123"/></label><label>Complemento<input name="complement" placeholder="Casa, apto, referência"/></label></div></div>}
        </section>

        <section className="checkoutCard"><div className="cardTitleIcon"><CreditCard/><div><h2>Forma de pagamento</h2><p>Escolha como deseja pagar.</p></div></div>
          <div className="paymentChoices">
            {store.pixEnabled && <label className={payment === 'pix' ? 'paymentChoice selected' : 'paymentChoice'}><input type="radio" name="payment" value="pix" checked={payment === 'pix'} onChange={() => setPayment('pix')}/><span>◈</span><div><strong>Pix</strong><small>{store.pixKey ? 'Pague pela chave cadastrada pela loja' : 'Combine o Pix com a loja'}</small></div></label>}
            {store.cashEnabled && <label className={payment === 'cash' ? 'paymentChoice selected' : 'paymentChoice'}><input type="radio" name="payment" value="cash" checked={payment === 'cash'} onChange={() => setPayment('cash')}/><span>💵</span><div><strong>Dinheiro</strong><small>Você pode informar o valor para troco</small></div></label>}
            {store.cardOnDeliveryEnabled && <label className={payment === 'card_on_delivery' ? 'paymentChoice selected' : 'paymentChoice'}><input type="radio" name="payment" value="card_on_delivery" checked={payment === 'card_on_delivery'} onChange={() => setPayment('card_on_delivery')}/><span>💳</span><div><strong>Cartão na entrega</strong><small>Débito ou crédito</small></div></label>}
          </div>
          {payment === 'pix' && store.pixEnabled && <div className="paymentExtraBox"><div><strong>Chave Pix da loja</strong><span>{store.pixKey || 'A loja ainda não cadastrou uma chave Pix.'}</span></div>{store.pixKey && <button type="button" className="miniButton" onClick={copyPixKey}>{pixCopied ? 'Copiado!' : 'Copiar chave'}</button>}</div>}
          {payment === 'cash' && store.cashEnabled && <div className="cashChangeBox"><label>Troco para quanto? <small>(opcional)</small><input value={cashChange} onChange={(e)=>setCashChange(e.target.value)} inputMode="decimal" placeholder={`Ex.: ${Math.ceil(total + 10)},00`}/></label><p>Se não precisar de troco, deixe em branco.</p></div>}
          {payment === 'card_on_delivery' && store.cardOnDeliveryEnabled && <div className="paymentExtraBox"><div><strong>Cartão na entrega/retirada</strong><span>O pagamento será feito na maquininha da loja ou do entregador.</span></div></div>}
          <label>Observações<textarea name="notes" rows={3} placeholder="Ex.: entregar na portaria, produto sem gelo..."/></label>
        </section>

        {hasAgeRestrictedItem && <section className="ageConfirm"><strong>Pedido com bebida alcoólica</strong><label><input type="checkbox" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)}/> Declaro que tenho 18 anos ou mais. A loja poderá solicitar documento na entrega ou retirada.</label></section>}
      </div>

      <aside className="orderSummaryCard"><h2>Resumo do pedido</h2><div className="miniItems">{items.map((item) => <div key={item.product.id}><span>{item.quantity}x {item.product.name}</span><strong>{formatBRL(item.product.price * item.quantity)}</strong></div>)}</div><hr/><div className="summaryLine"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div><div className="summaryLine"><span>Entrega</span><span>{orderType === 'pickup' ? 'Retirada' : requiresZone && !selectedZone ? 'Selecione o bairro' : deliveryFee === 0 ? 'Grátis' : formatBRL(deliveryFee)}</span></div><div className="summaryTotal"><span>Total</span><strong>{formatBRL(total)}</strong></div><button className="button large full" type="submit" disabled={!canSubmit || submitting || !store.open}>{submitting ? 'Enviando...' : orderingAllowed === false ? 'Pedidos pausados' : store.open ? 'Confirmar pedido' : 'Loja fechada'}</button><small className="secureText"><MapPin size={14}/> Seus dados são usados apenas para concluir este pedido.</small></aside>
    </form>
  </div></div>
}
