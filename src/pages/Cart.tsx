import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { useCart } from '../context/CartContext'
import { formatBRL } from '../lib/format'

export default function Cart() {
  const { items, store, addItem, decreaseItem, removeItem, subtotal } = useCart()
  const minOrder = store?.minOrder || 0
  const meetsMinimum = subtotal >= minOrder
  const storeUrl = store ? `/loja/${store.slug}` : '/'

  const brandStyle = { '--store-color': store?.primaryColor || '#ff5a1f' } as CSSProperties

  return <div className="checkoutPage customerFlowPage" style={brandStyle}>
    <div className="checkoutShell">
      <header className="checkoutHeader"><Link to={storeUrl}><ArrowLeft/></Link><div><strong>Seu carrinho</strong><small>{store?.name || 'Pedevo'}</small></div></header>
      <main className="checkoutMain">
        {items.length === 0 || !store ? <div className="emptyCart"><ShoppingBag size={44}/><h2>Seu carrinho está vazio</h2><p>Escolha alguns produtos para continuar.</p><Link className="button" to={storeUrl}>Voltar para a loja</Link></div> : <>
          <section className="checkoutCard"><h2>Itens do pedido</h2>{items.map((item) => <div className="cartItem" key={item.product.id}><div className="cartEmoji">{item.product.image ? <img src={item.product.image} alt={item.product.name}/> : (item.product.emoji || '📦')}</div><div className="cartItemInfo"><strong>{item.product.name}</strong><span>{formatBRL(item.product.price)} / {item.product.unitLabel}</span><div className="qtyControl"><button onClick={() => decreaseItem(item.product.id)}><Minus/></button><span>{item.quantity}</span><button onClick={() => addItem(item.product)}><Plus/></button></div></div><div className="cartItemRight"><strong>{formatBRL(item.product.price * item.quantity)}</strong><button className="trashButton" onClick={() => removeItem(item.product.id)}><Trash2 size={18}/></button></div></div>)}</section>
          <section className="checkoutCard"><h2>Resumo</h2><div className="summaryLine"><span>Subtotal</span><strong>{formatBRL(subtotal)}</strong></div><div className="summaryLine muted"><span>Entrega</span><span>calculada na próxima etapa</span></div><div className="summaryTotal"><span>Total parcial</span><strong>{formatBRL(subtotal)}</strong></div></section>
          {!meetsMinimum && <div className="minimumAlert">Faltam {formatBRL(minOrder - subtotal)} para atingir o pedido mínimo de {formatBRL(minOrder)}.</div>}
          <Link to="/checkout" className={meetsMinimum ? 'button large full' : 'button large full disabled'} aria-disabled={!meetsMinimum} onClick={(event) => { if (!meetsMinimum) event.preventDefault() }}>Continuar para entrega e pagamento</Link>
        </>}
      </main>
    </div>
  </div>
}
