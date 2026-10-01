import { CheckCircle2, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { formatBRL } from '../lib/format'

type LastOrder = {
  id?: string
  total?: number
  orderType?: string
  storeName?: string
  storeWhatsapp?: string
  storeSlug?: string
  storePrimaryColor?: string
}

export default function OrderSuccess() {
  let order: LastOrder = {}
  try { order = JSON.parse(localStorage.getItem('pedevo-last-order') || '{}') } catch { /* noop */ }
  const displayId = order.id ? String(order.id).slice(0, 8).toUpperCase() : 'PEDIDO'
  const whatsapp = String(order.storeWhatsapp || '').replace(/\D/g, '')
  const whatsappText = encodeURIComponent(`Olá! Acabei de fazer o pedido ${displayId} pelo Pedevo.`)
  const storeUrl = order.storeSlug ? `/loja/${order.storeSlug}` : '/'
  const brandStyle = { '--store-color': order.storePrimaryColor || '#ff5a1f' } as CSSProperties

  return <div className="successPage customerFlowPage" style={brandStyle}><div className="successCard"><div className="successIcon"><CheckCircle2/></div><span>Pedido recebido</span><h1>Obrigado pelo seu pedido!</h1><p>O {order.storeName || 'estabelecimento'} recebeu sua solicitação. A loja poderá confirmar detalhes pelo WhatsApp.</p><div className="successOrder"><div><span>Referência</span><strong>{displayId}</strong></div><div><span>Total</span><strong>{formatBRL(order.total || 0)}</strong></div><div><span>Recebimento</span><strong>{order.orderType === 'pickup' ? 'Retirada' : 'Delivery'}</strong></div></div>{whatsapp && <a className="button large full" target="_blank" rel="noreferrer" href={`https://wa.me/${whatsapp}?text=${whatsappText}`}><MessageCircle size={19}/> Falar com a loja no WhatsApp</a>}<Link to={storeUrl} className="textLink">Voltar para a loja</Link></div></div>
}
