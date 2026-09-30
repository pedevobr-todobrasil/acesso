import { supabase } from './supabase'

export type CreateStoreInput = {
  name: string
  businessType: string
  whatsapp: string
  address: string
  delivery: boolean
  pickup: boolean
  pix: boolean
  cash: boolean
  card: boolean
}

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

const categoryPresets: Record<string, Array<[string, string]>> = {
  deposito_bebidas: [['Cervejas','🍺'],['Refrigerantes','🥤'],['Água e gelo','🧊'],['Energéticos','⚡'],['Petiscos','🥨']],
  hamburgueria: [['Hambúrgueres','🍔'],['Combos','🍟'],['Bebidas','🥤'],['Sobremesas','🍨']],
  pizzaria: [['Pizzas','🍕'],['Bebidas','🥤'],['Sobremesas','🍨']],
  pastelaria: [['Pastéis','🥟'],['Combos','🍟'],['Bebidas','🥤']],
  doceria: [['Doces','🧁'],['Bolos','🎂'],['Bebidas','☕']],
  acai: [['Açaí','🍧'],['Complementos','🍓'],['Bebidas','🥤']],
  marmitaria: [['Marmitas','🍱'],['Bebidas','🥤'],['Sobremesas','🍮']],
  restaurante: [['Pratos','🍽️'],['Bebidas','🥤'],['Sobremesas','🍮']],
  conveniencia: [['Bebidas','🥤'],['Snacks','🍫'],['Mercearia','🛒']],
  outro: [['Produtos','📦']],
}

export async function createStoreWithDefaults(input: CreateStoreInput) {
  if (!supabase) return { demo: true, store: null, error: null }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return { demo: false, store: null, error: userError || new Error('Usuário não autenticado') }

  const baseSlug = slugify(input.name) || `loja-${Date.now()}`
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`

  const { data: store, error } = await supabase
    .from('stores')
    .insert({
      owner_id: userData.user.id,
      name: input.name,
      slug,
      business_type: input.businessType,
      whatsapp: input.whatsapp,
      address_line: input.address,
      delivery_enabled: input.delivery,
      pickup_enabled: input.pickup,
      pix_enabled: input.pix,
      cash_enabled: input.cash,
      card_on_delivery_enabled: input.card,
      age_restricted_sales: input.businessType === 'deposito_bebidas' || input.businessType === 'conveniencia',
    })
    .select('*')
    .single()

  if (error || !store) return { demo: false, store: null, error }

  const preset = categoryPresets[input.businessType] || categoryPresets.outro
  await supabase.from('categories').insert(
    preset.map(([name, icon], index) => ({ store_id: store.id, name, icon, sort_order: index })),
  )

  return { demo: false, store, error: null }
}

export async function getOwnedStore() {
  if (!supabase) return { data: null, error: null }
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return { data: null, error: userError || new Error('Usuário não autenticado') }
  return supabase.from('stores').select('*').eq('owner_id', userData.user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
}

export async function getStoreCatalog(slug: string) {
  if (!supabase) return { store: null, categories: [], products: [], deliveryZones: [], error: null }
  const { data: store, error } = await supabase.from('stores').select('*').eq('slug', slug).eq('is_active', true).maybeSingle()
  if (error || !store) return { store: null, categories: [], products: [], deliveryZones: [], error }
  const [categories, products, deliveryZones] = await Promise.all([
    supabase.from('categories').select('*').eq('store_id', store.id).eq('active', true).order('sort_order'),
    supabase.from('products').select('*').eq('store_id', store.id).eq('active', true).order('created_at', { ascending: false }),
    supabase.from('delivery_zones').select('*').eq('store_id', store.id).eq('active', true).order('name'),
  ])
  return {
    store,
    categories: categories.data || [],
    products: products.data || [],
    deliveryZones: deliveryZones.data || [],
    error: categories.error || products.error || deliveryZones.error || null,
  }
}

export async function uploadProductImage(file: File) {
  if (!supabase) return { url: null, error: new Error('Supabase não configurado') }
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return { url: null, error: userError || new Error('Usuário não autenticado') }
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${userData.user.id}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('products').upload(path, file, { upsert: false })
  if (error) return { url: null, error }
  const { data } = supabase.storage.from('products').getPublicUrl(path)
  return { url: data.publicUrl, error: null }
}

export async function createProduct(storeId: string, input: {
  name: string
  description?: string
  price: number
  categoryId?: string | null
  unitLabel?: string
  stock?: number | null
  requiresAge18?: boolean
  imageUrl?: string | null
}) {
  if (!supabase) return { data: null, error: new Error('Supabase não configurado') }
  return supabase.from('products').insert({
    store_id: storeId,
    category_id: input.categoryId || null,
    name: input.name,
    description: input.description || null,
    price: input.price,
    unit_label: input.unitLabel || 'unidade',
    stock: input.stock ?? null,
    requires_age_18: Boolean(input.requiresAge18),
    image_url: input.imageUrl || null,
  }).select('*').single()
}

export async function placeOrder(input: {
  storeId: string
  customerName: string
  customerWhatsapp: string
  orderType: 'delivery' | 'pickup'
  paymentMethod: 'pix' | 'cash' | 'card_on_delivery'
  deliveryAddress: Record<string, string> | null
  deliveryZoneId?: string | null
  notes?: string
  ageConfirmed: boolean
  items: Array<{ productId: string; quantity: number }>
}) {
  if (!supabase) return { data: null, error: new Error('Supabase não configurado') }
  return supabase.rpc('place_order', {
    p_store_id: input.storeId,
    p_customer_name: input.customerName,
    p_customer_whatsapp: input.customerWhatsapp,
    p_order_type: input.orderType,
    p_payment_method: input.paymentMethod,
    p_delivery_address: input.deliveryAddress,
    p_delivery_zone_id: input.deliveryZoneId || null,
    p_notes: input.notes || null,
    p_age_confirmed: input.ageConfirmed,
    p_items: input.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
  })
}
