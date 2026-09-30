import { CheckCircle2, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { demoStore } from '../data/demo'
import { formatBRL } from '../lib/format'

export default function OrderSuccess() {
  let order: { id?: string; total?: number; orderType?: string } = {}
  try { order = JSON.parse(localStorage.getItem('pedevo-last-order') || '{}') } catch { /* noop */ }
  const whatsappText = encodeURIComponent(`Olá! Acabei de fazer o pedido ${order.id || ''} pelo Pedevo.`)
  return <div className="successPage"><div className="successCard"><div className="successIcon"><CheckCircle2/></div><span>Pedido recebido</span><h1>Obrigado pelo seu pedido!</h1><p>O {demoStore.name} recebeu sua solicitação. A loja poderá confirmar detalhes pelo WhatsApp.</p><div className="successOrder"><div><span>Número</span><strong>{order.id || 'PED-DEMO'}</strong></div><div><span>Total</span><strong>{formatBRL(order.total || 0)}</strong></div><div><span>Recebimento</span><strong>{order.orderType === 'pickup' ? 'Retirada' : 'Delivery'}</strong></div></div><a className="button large full" target="_blank" rel="noreferrer" href={`https://wa.me/${demoStore.whatsapp}?text=${whatsappText}`}><MessageCircle size={19}/> Falar com a loja no WhatsApp</a><Link to="/loja/deposito-central" className="textLink">Voltar para a loja</Link></div></div>
}
