import { AlertTriangle, ChevronRight, Clock3, MapPin, Minus, Plus, Search, ShoppingBag, Store as StoreIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatBRL } from '../lib/format'
import { getStoreCatalog, getStoreOrderingStatus } from '../lib/pedevoApi'
import { isStoreOpenNow, todayStoreHours } from '../lib/storeHours'
import type { Category, DeliveryZone, OpeningHours, Product, Store } from '../types'

function mapStore(row: any, zones: any[] = []): Store {
  const deliveryZones: DeliveryZone[] = zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    fee: Number(zone.fee || 0),
    etaMinMinutes: zone.eta_min_minutes == null ? null : Number(zone.eta_min_minutes),
    etaMaxMinutes: zone.eta_max_minutes == null ? null : Number(zone.eta_max_minutes),
    active: Boolean(zone.active),
  }))
  const openingHours = (row.opening_hours || {}) as OpeningHours
  const timezone = row.timezone || 'America/Sao_Paulo'

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.business_type,
    description: row.description || 'Faça seu pedido online com rapidez e segurança.',
    whatsapp: row.whatsapp || '',
    logoUrl: row.logo_url || undefined,
    bannerUrl: row.banner_url || undefined,
    primaryColor: row.primary_color || '#ff5a1f',
    minOrder: Number(row.min_order || 0),
    deliveryFee: Number(row.default_delivery_fee || 0),
    deliveryEnabled: Boolean(row.delivery_enabled),
    pickupEnabled: Boolean(row.pickup_enabled),
    pixEnabled: Boolean(row.pix_enabled),
    pixKey: row.pix_key || '',
    pixAutoEnabled: Boolean(row.pix_auto_enabled),
    cashEnabled: Boolean(row.cash_enabled),
    cardOnDeliveryEnabled: Boolean(row.card_on_delivery_enabled),
    ageRestrictedSales: Boolean(row.age_restricted_sales),
    address: row.address_line || [row.city, row.state].filter(Boolean).join(' - ') || 'Endereço não informado',
    city: row.city || '',
    state: row.state || '',
    timezone,
    openingHours,
    open: Boolean(row.is_open),
    deliveryZones,
  }
}

function mapProduct(row: any): Product {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    description: row.description || '',
    price: Number(row.price || 0),
    categoryId: row.category_id || '',
    image: row.image_url || undefined,
    emoji: row.requires_age_18 ? '🍺' : '📦',
    active: Boolean(row.active),
    unitLabel: row.unit_label || 'unidade',
    stock: row.stock == null ? null : Number(row.stock),
    requiresAge18: Boolean(row.requires_age_18),
    featured: Boolean(row.featured),
  }
}




export default function Storefront() {
  const { slug = '' } = useParams()
  const [category, setCategory] = useState('todos')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [storeData, setStoreData] = useState<Store | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([])
  const [orderingStatus, setOrderingStatus] = useState<{can_order:boolean;code?:string;message?:string}>({can_order:true})
  const [, setClockTick] = useState(0)
  const { addItem, decreaseItem, items, totalItems, subtotal, setStore } = useCart()

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadCatalog() {
      setLoading(true)
      setError('')
      const result = await getStoreCatalog(slug)
      if (!mounted) return
      if (result.error) {
        setError(result.error.message || 'Não foi possível carregar a loja.')
        setLoading(false)
        return
      }
      if (!result.store) {
        setError('Loja não encontrada ou indisponível.')
        setLoading(false)
        return
      }
      const mappedStore = mapStore(result.store, result.deliveryZones || [])
      const mappedCategories = (result.categories || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        icon: row.icon || '📦',
        active: Boolean(row.active),
      }))
      const mappedProducts = (result.products || []).map(mapProduct)
      const orderStatusResult = await getStoreOrderingStatus(mappedStore.id)
      if (!mounted) return
      setStoreData(mappedStore)
      setCategories(mappedCategories)
      setCatalogProducts(mappedProducts)
      setOrderingStatus(orderStatusResult.data || { can_order: false, message: 'Pedidos temporariamente indisponíveis.' })
      setStore(mappedStore)
      setLoading(false)
    }
    loadCatalog()
    return () => { mounted = false }
  }, [slug, setStore])

  useEffect(() => {
    if (!storeData?.id) return
    let active = true
    const refresh = async () => {
      const result = await getStoreOrderingStatus(storeData.id)
      if (active && !result.error) setOrderingStatus(result.data || { can_order:false, message:'Pedidos indisponíveis.' })
    }
    const timer = window.setInterval(refresh, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [storeData?.id])

  const products = useMemo(() => catalogProducts.filter((product) => {
    const categoryMatch = category === 'todos' || product.categoryId === category
    const searchMatch = `${product.name} ${product.description}`.toLowerCase().includes(search.toLowerCase())
    return product.active && categoryMatch && searchMatch
  }), [catalogProducts, category, search])

  const quantityOf = (id: string) => items.find((item) => item.product.id === id)?.quantity ?? 0
  const effectiveOpen = storeData ? isStoreOpenNow(storeData.open, storeData.openingHours, storeData.timezone) : false
  const deliveryStartingFee = storeData ? Math.min(storeData.deliveryFee, ...(storeData.deliveryZones || []).filter((zone) => zone.active).map((zone) => zone.fee)) : 0

  if (loading) return <div className="storePage"><main className="pageWidth storeContent"><div className="storeMessage"><h2>Carregando loja...</h2><p>Buscando o cardápio no Supabase.</p></div></main></div>
  if (!storeData || error) return <div className="storePage"><main className="pageWidth storeContent"><div className="storeMessage"><h2>Loja indisponível</h2><p>{error || 'Não foi possível encontrar esta loja.'}</p><Link className="button" to="/">Voltar ao Pedevo</Link></div></main></div>

  return (
    <div className="storePage" style={{ '--store-color': storeData.primaryColor } as CSSProperties}>
      <header className="storeHeader">
        <div className="pageWidth storeHeaderInner">
          <Link to="/" className="storePedevo">Feito com <strong>Pedevo</strong></Link>
          <Link to="/entrar" className="storeOwnerLink"><StoreIcon size={16}/> Área do lojista</Link>
        </div>
      </header>
      <main className="pageWidth storeContent">
        {storeData.bannerUrl && <section className="storeBanner"><img src={storeData.bannerUrl} alt={`Banner ${storeData.name}`}/></section>}
        <section className="storeProfile">
          <div className={storeData.logoUrl ? 'storeLogo hasImage' : 'storeLogo'}>{storeData.logoUrl ? <img src={storeData.logoUrl} alt={`Logo ${storeData.name}`}/> : storeData.name.split(' ').slice(0,2).map((word) => word[0]).join('').toUpperCase()}</div>
          <div className="storeMeta">
            <div className="storeTitleRow"><h1>{storeData.name}</h1><span className={effectiveOpen ? 'openBadge' : 'closedBadge'}>{effectiveOpen ? 'Aberto' : 'Fechado'}</span></div>
            <p>{storeData.description}</p>
            <div className="storeInfoRow"><span><MapPin size={15}/>{storeData.address}</span><span><Clock3 size={15}/>{todayStoreHours(storeData.openingHours, storeData.timezone)}</span></div>
          </div>
          <div className="storeDeliveryInfo"><small>Pedido mínimo</small><strong>{formatBRL(storeData.minOrder)}</strong><span>{storeData.deliveryEnabled ? `Entrega a partir de ${formatBRL(deliveryStartingFee)}` : 'Somente retirada'}</span></div>
        </section>
        {!orderingStatus.can_order && <div className="storeOrderingPaused"><AlertTriangle size={18}/><div><strong>Pedidos temporariamente pausados</strong><span>{orderingStatus.message || 'Esta loja não está recebendo novos pedidos no momento.'}</span></div></div>}

        <section className="storeToolbar">
          <label className="searchBox"><Search size={19}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar no cardápio..." /></label>
          <div className="deliveryPills">{storeData.deliveryEnabled && <span>Delivery</span>}{storeData.pickupEnabled && <span>Retirada</span>}</div>
        </section>

        <div className="categoryScroller">
          <button className={category === 'todos' ? 'categoryChip active' : 'categoryChip'} onClick={() => setCategory('todos')}>✨ Todos</button>
          {categories.map((item) => <button key={item.id} className={category === item.id ? 'categoryChip active' : 'categoryChip'} onClick={() => setCategory(item.id)}>{item.icon} {item.name}</button>)}
        </div>

        <section>
          <div className="storeSectionTitle"><div><h2>{category === 'todos' ? 'Produtos' : categories.find((c) => c.id === category)?.name}</h2><p>{products.length} item(ns) disponíveis</p></div></div>
          {products.length === 0 ? <div className="storeMessage compact"><h3>Nenhum produto encontrado</h3><p>Tente outra categoria ou termo de busca.</p></div> : <div className="productGrid">
            {products.map((product) => {
              const quantity = quantityOf(product.id)
              const soldOut = product.stock === 0
              return <article className="productCard" key={product.id}>
                <div className="productVisual">{product.image ? <img src={product.image} alt={product.name}/> : <span>{product.emoji || '📦'}</span>}{product.requiresAge18 && <small>18+</small>}</div>
                <div className="productBody">
                  <div><h3>{product.name}</h3><p>{product.description || 'Produto disponível para pedido.'}</p>{product.stock != null && <em className={soldOut ? 'stockText soldOut' : 'stockText'}>{soldOut ? 'Esgotado' : `${product.stock} em estoque`}</em>}</div>
                  <div className="productBottom"><div><strong>{formatBRL(product.price)}</strong>{product.unitLabel && <small>/ {product.unitLabel}</small>}</div>
                    {!effectiveOpen ? <span className="closedProductTag">Fechado</span> : !orderingStatus.can_order ? <span className="closedProductTag">Pausado</span> : soldOut ? <button className="addCircle disabled" disabled aria-label="Esgotado">×</button> : quantity === 0 ? <button className="addCircle" onClick={() => addItem(product)} aria-label="Adicionar"><Plus /></button> : <div className="qtyControl"><button onClick={() => decreaseItem(product.id)}><Minus/></button><span>{quantity}</span><button onClick={() => addItem(product)}><Plus/></button></div>}
                  </div>
                </div>
              </article>
            })}
          </div>}
        </section>
      </main>
      {totalItems > 0 && orderingStatus.can_order && <div className="cartBarWrap"><Link to="/carrinho" className="cartBar"><div><ShoppingBag size={20}/><span>{totalItems} item(ns)</span></div><strong>Ver carrinho • {formatBRL(subtotal)}</strong><ChevronRight size={20}/></Link></div>}
    </div>
  )
}
