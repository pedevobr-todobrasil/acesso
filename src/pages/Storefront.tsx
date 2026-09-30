import { ChevronRight, Clock3, MapPin, Minus, Plus, Search, ShoppingBag, Store as StoreIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { demoCategories, demoProducts, demoStore } from '../data/demo'
import { formatBRL } from '../lib/format'

export default function Storefront() {
  const [category, setCategory] = useState('todos')
  const [search, setSearch] = useState('')
  const { addItem, decreaseItem, items, totalItems, subtotal } = useCart()

  const products = useMemo(() => demoProducts.filter((product) => {
    const categoryMatch = category === 'todos' || product.categoryId === category
    const searchMatch = `${product.name} ${product.description}`.toLowerCase().includes(search.toLowerCase())
    return product.active && categoryMatch && searchMatch
  }), [category, search])

  const quantityOf = (id: string) => items.find((item) => item.product.id === id)?.quantity ?? 0

  return (
    <div className="storePage">
      <header className="storeHeader">
        <div className="pageWidth storeHeaderInner">
          <Link to="/" className="storePedevo">Feito com <strong>Pedevo</strong></Link>
          <Link to="/entrar" className="storeOwnerLink"><StoreIcon size={16}/> Área do lojista</Link>
        </div>
      </header>
      <main className="pageWidth storeContent">
        <section className="storeProfile">
          <div className="storeLogo">DC</div>
          <div className="storeMeta">
            <div className="storeTitleRow"><h1>{demoStore.name}</h1><span className={demoStore.open ? 'openBadge' : 'closedBadge'}>{demoStore.open ? 'Aberto' : 'Fechado'}</span></div>
            <p>{demoStore.description}</p>
            <div className="storeInfoRow"><span><MapPin size={15}/>{demoStore.address}</span><span><Clock3 size={15}/> 08:00 às 23:30</span></div>
          </div>
          <div className="storeDeliveryInfo"><small>Pedido mínimo</small><strong>{formatBRL(demoStore.minOrder)}</strong><span>Entrega a partir de {formatBRL(demoStore.deliveryFee)}</span></div>
        </section>

        <section className="storeToolbar">
          <label className="searchBox"><Search size={19}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar no cardápio..." /></label>
          <div className="deliveryPills"><span>Delivery</span><span>Retirada</span></div>
        </section>

        <div className="categoryScroller">
          <button className={category === 'todos' ? 'categoryChip active' : 'categoryChip'} onClick={() => setCategory('todos')}>✨ Todos</button>
          {demoCategories.map((item) => <button key={item.id} className={category === item.id ? 'categoryChip active' : 'categoryChip'} onClick={() => setCategory(item.id)}>{item.icon} {item.name}</button>)}
        </div>

        <section>
          <div className="storeSectionTitle"><div><h2>{category === 'todos' ? 'Produtos' : demoCategories.find((c) => c.id === category)?.name}</h2><p>{products.length} item(ns) disponíveis</p></div></div>
          <div className="productGrid">
            {products.map((product) => {
              const quantity = quantityOf(product.id)
              return <article className="productCard" key={product.id}>
                <div className="productVisual"><span>{product.emoji}</span>{product.requiresAge18 && <small>18+</small>}</div>
                <div className="productBody">
                  <div><h3>{product.name}</h3><p>{product.description}</p></div>
                  <div className="productBottom"><div><strong>{formatBRL(product.price)}</strong>{product.unitLabel && <small>/ {product.unitLabel}</small>}</div>
                    {quantity === 0 ? <button className="addCircle" onClick={() => addItem(product)} aria-label="Adicionar"><Plus /></button> : <div className="qtyControl"><button onClick={() => decreaseItem(product.id)}><Minus/></button><span>{quantity}</span><button onClick={() => addItem(product)}><Plus/></button></div>}
                  </div>
                </div>
              </article>
            })}
          </div>
        </section>
      </main>
      {totalItems > 0 && <div className="cartBarWrap"><Link to="/carrinho" className="cartBar"><div><ShoppingBag size={20}/><span>{totalItems} item(ns)</span></div><strong>Ver carrinho • {formatBRL(subtotal)}</strong><ChevronRight size={20}/></Link></div>}
    </div>
  )
}
