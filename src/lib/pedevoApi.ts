import { supabase } from './supabase'

export type CreateStoreInput = {
  name: string
  businessType: string
  whatsapp: string
  address: string
  city: string
  state: string
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
      city: input.city,
      state: input.state.toUpperCase(),
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

  // Se o visitante escolheu um plano/promoção na página pública, aplica a preferência
  // enquanto a assinatura ainda está pendente. Caso não exista preferência, o banco
  // mantém automaticamente o plano padrão ativo.
  try {
    const selectedPlanCode = localStorage.getItem('pedevo-selected-plan')
    if (selectedPlanCode) {
      await supabase.rpc('select_initial_subscription_plan', { p_store_id: store.id, p_plan_code: selectedPlanCode })
      localStorage.removeItem('pedevo-selected-plan')
    }
  } catch {
    // LocalStorage indisponível não impede a criação da loja.
  }

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
  customerEmail?: string
  orderType: 'delivery' | 'pickup'
  paymentMethod: 'pix' | 'cash' | 'card_on_delivery'
  deliveryAddress: Record<string, string> | null
  deliveryZoneId?: string | null
  notes?: string
  ageConfirmed: boolean
  items: Array<{ productId: string; quantity: number }>
}) {
  if (!supabase) return { data: null, error: new Error('Supabase não configurado') }
  return supabase.rpc('place_order_v2', {
    p_store_id: input.storeId,
    p_customer_name: input.customerName,
    p_customer_whatsapp: input.customerWhatsapp,
    p_customer_email: input.customerEmail || null,
    p_order_type: input.orderType,
    p_payment_method: input.paymentMethod,
    p_delivery_address: input.deliveryAddress,
    p_delivery_zone_id: input.deliveryZoneId || null,
    p_notes: input.notes || null,
    p_age_confirmed: input.ageConfirmed,
    p_items: input.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
  })
}

export async function createAutomaticPixPayment(input: {
  orderId: string
  trackingToken: string
  payerEmail: string
  payerDocument: string
}) {
  if (!supabase) return { data: null, error: new Error('Supabase não configurado') }
  return supabase.functions.invoke('create-pix-payment', { body: input })
}

export async function createManualPixPayment(input: {
  orderId: string
  trackingToken: string
}) {
  if (!supabase) return { data: null, error: new Error('Supabase não configurado') }

  const result = await supabase.functions.invoke('create-manual-pix', { body: input })
  if (!result.error) return result

  let message = result.error.message || 'Não foi possível gerar o Pix.'
  try {
    const context = (result.error as any)?.context
    if (context && typeof context.clone === 'function') {
      const response = context.clone()
      const body = await response.json().catch(() => null)
      if (body?.error) message = String(body.error)
    }
  } catch {
    // Mantém a mensagem original caso a resposta não possa ser lida.
  }

  return { data: result.data, error: new Error(message) }
}

export async function markManualPixPaid(orderId: string) {
  if (!supabase) return { data: null, error: new Error('Supabase não configurado') }
  return supabase.rpc('owner_mark_pix_paid', { p_order_id: orderId })
}

export async function expireAutomaticPixPayment(orderId: string, trackingToken: string) {
  if (!supabase) return { data: null, error: new Error('Supabase não configurado') }
  return supabase.functions.invoke('expire-single-pix', { body: { orderId, trackingToken } })
}

export async function getPublicOrderTracking(orderId: string, trackingToken: string) {
  if (!supabase) return { data: null, error: new Error('Supabase não configurado') }

  const result = await supabase.functions.invoke('track-order', {
    body: { orderId, trackingToken },
  })
  if (!result.error) return result

  let message = result.error.message || 'Não foi possível atualizar o pedido.'
  try {
    const context = (result.error as any)?.context
    if (context && typeof context.clone === 'function') {
      const response = context.clone()
      const body = await response.json().catch(() => null)
      if (body?.error) message = String(body.error)
    }
  } catch {
    // Mantém a mensagem original se a resposta não puder ser lida.
  }
  return { data: result.data, error: new Error(message) }
}

export async function sendOrderWhatsapp(input: {
  orderId: string
  trackingToken?: string
  event: 'order_received' | 'payment_approved' | 'out_for_delivery'
}) {
  if (!supabase) return { data: null, error: new Error('Supabase não configurado') }
  return supabase.functions.invoke('order-whatsapp', { body: input })
}

export async function saveMercadoPagoToken(storeId: string, accessToken: string) {
  if (!supabase) return { data: null, error: new Error('Supabase não configurado') }
  return supabase.functions.invoke('save-mercadopago-token', { body: { storeId, accessToken } })
}

export async function getStoreOrderingStatus(storeId: string) {
  if (!supabase) return { data: { can_order: true, code: 'demo', message: 'Pedidos disponíveis.' }, error: null }
  return supabase.rpc('get_store_ordering_status', { p_store_id: storeId })
}


export async function getPublicSaasPlans() {
  if (!supabase) return { data: [], error: null }
  return supabase.rpc('get_active_saas_plans')
}

export function rememberSelectedSaasPlan(code: string) {
  try { localStorage.setItem('pedevo-selected-plan', code) } catch { /* ignore */ }
}
