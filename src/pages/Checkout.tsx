import { ArrowLeft, CheckCircle2, CreditCard, MapPin, PackageCheck, ShoppingBag, Truck } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { demoStore } from '../data/demo'
import { formatBRL } from '../lib/format'

export default function Checkout() {
  const navigate = useNavigate()
  const { items, subtotal, hasAgeRestrictedItem, clearCart } = useCart()
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>('delivery')
  const [payment, setPayment] = useState('pix')
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const deliveryFee = orderType === 'delivery' ? demoStore.deliveryFee : 0
  const total = subtotal + deliveryFee

  const canSubmit = useMemo(() => items.length > 0 && (!hasAgeRestrictedItem || ageConfirmed), [items.length, hasAgeRestrictedItem, ageConfirmed])

  async function finishOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    const form = new FormData(event.currentTarget)
    const order = {
      id: `PED-${Date.now().toString().slice(-6)}`,
      customer: form.get('name'),
      whatsapp: form.get('whatsapp'),
      orderType,
      payment,
      total,
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('pedevo-last-order', JSON.stringify(order))
    clearCart()
    navigate('/pedido-concluido')
  }

  return <div className="checkoutPage"><div className="checkoutShell wideCheckout">
    <header className="checkoutHeader"><Link to="/carrinho"><ArrowLeft/></Link><div><strong>Finalizar pedido</strong><small>{demoStore.name}</small></div></header>
    <form className="checkoutGrid" onSubmit={finishOrder}>
      <div className="checkoutMain">
        <section className="checkoutCard"><div className="cardTitleIcon"><ShoppingBag/><div><h2>Seus dados</h2><p>Usaremos o WhatsApp para falar sobre o pedido.</p></div></div>
          <div className="formGrid two"><label>Nome completo<input name="name" required placeholder="Ex.: João da Silva"/></label><label>WhatsApp<input name="whatsapp" required inputMode="tel" placeholder="(63) 99999-9999"/></label></div>
        </section>

        <section className="checkoutCard"><div className="cardTitleIcon"><Truck/><div><h2>Como deseja receber?</h2><p>Escolha entrega ou retirada.</p></div></div>
          <div className="choiceGrid"><button type="button" onClick={() => setOrderType('delivery')} className={orderType === 'delivery' ? 'choiceCard selected' : 'choiceCard'}><Truck/><div><strong>Delivery</strong><span>Receber no endereço</span></div>{orderType === 'delivery' && <CheckCircle2/>}</button><button type="button" onClick={() => setOrderType('pickup')} className={orderType === 'pickup' ? 'choiceCard selected' : 'choiceCard'}><PackageCheck/><div><strong>Retirada</strong><span>Buscar na loja</span></div>{orderType === 'pickup' && <CheckCircle2/>}</button></div>
          {orderType === 'delivery' && <div className="addressFields"><div className="formGrid two"><label>CEP<input name="cep" required placeholder="00000-000"/></label><label>Bairro<input name="neighborhood" required placeholder="Seu bairro"/></label></div><label>Rua / Avenida<input name="street" required placeholder="Nome da rua"/></label><div className="formGrid two"><label>Número<input name="number" required placeholder="123"/></label><label>Complemento<input name="complement" placeholder="Casa, apto, referência"/></label></div></div>}
        </section>

        <section className="checkoutCard"><div className="cardTitleIcon"><CreditCard/><div><h2>Forma de pagamento</h2><p>Escolha como deseja pagar.</p></div></div>
          <div className="paymentChoices">
            <label className={payment === 'pix' ? 'paymentChoice selected' : 'paymentChoice'}><input type="radio" name="payment" value="pix" checked={payment === 'pix'} onChange={() => setPayment('pix')}/><span>◈</span><div><strong>Pix</strong><small>Pagamento na entrega/retirada neste MVP</small></div></label>
            <label className={payment === 'cash' ? 'paymentChoice selected' : 'paymentChoice'}><input type="radio" name="payment" value="cash" checked={payment === 'cash'} onChange={() => setPayment('cash')}/><span>💵</span><div><strong>Dinheiro</strong><small>Informe troco nas observações</small></div></label>
            <label className={payment === 'card' ? 'paymentChoice selected' : 'paymentChoice'}><input type="radio" name="payment" value="card" checked={payment === 'card'} onChange={() => setPayment('card')}/><span>💳</span><div><strong>Cartão na entrega</strong><small>Débito ou crédito</small></div></label>
          </div>
          <label>Observações<textarea name="notes" rows={3} placeholder="Ex.: entregar na portaria, produto sem gelo..."/></label>
        </section>

        {hasAgeRestrictedItem && <section className="ageConfirm"><strong>Pedido com bebida alcoólica</strong><label><input type="checkbox" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)}/> Declaro que tenho 18 anos ou mais. A loja poderá solicitar documento na entrega ou retirada.</label></section>}
      </div>

      <aside className="orderSummaryCard"><h2>Resumo do pedido</h2><div className="miniItems">{items.map((item) => <div key={item.product.id}><span>{item.quantity}x {item.product.name}</span><strong>{formatBRL(item.product.price * item.quantity)}</strong></div>)}</div><hr/><div className="summaryLine"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div><div className="summaryLine"><span>Entrega</span><span>{deliveryFee === 0 ? 'Grátis / retirada' : formatBRL(deliveryFee)}</span></div><div className="summaryTotal"><span>Total</span><strong>{formatBRL(total)}</strong></div><button className="button large full" type="submit" disabled={!canSubmit || submitting}>{submitting ? 'Enviando...' : 'Confirmar pedido'}</button><small className="secureText"><MapPin size={14}/> Seus dados são usados apenas para concluir este pedido.</small></aside>
    </form>
  </div></div>
}
