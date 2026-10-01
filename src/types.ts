export type StoreType =
  | 'hamburgueria'
  | 'pizzaria'
  | 'pastelaria'
  | 'doceria'
  | 'acai'
  | 'marmitaria'
  | 'restaurante'
  | 'deposito_bebidas'
  | 'conveniencia'
  | 'outro'

export type Category = {
  id: string
  name: string
  icon?: string
  active?: boolean
}

export type Product = {
  id: string
  storeId?: string
  name: string
  description: string
  price: number
  categoryId: string
  image?: string
  emoji?: string
  active: boolean
  unitLabel?: string
  stock?: number | null
  requiresAge18?: boolean
  featured?: boolean
}

export type DayHours = {
  enabled: boolean
  open: string
  close: string
}

export type OpeningHours = Partial<Record<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', DayHours>>

export type DeliveryZone = {
  id: string
  name: string
  fee: number
  etaMinMinutes?: number | null
  etaMaxMinutes?: number | null
  active: boolean
}

export type Store = {
  id: string
  name: string
  slug: string
  type: StoreType
  description: string
  whatsapp: string
  logoUrl?: string
  bannerUrl?: string
  primaryColor: string
  minOrder: number
  deliveryFee: number
  deliveryEnabled: boolean
  pickupEnabled: boolean
  pixEnabled: boolean
  pixKey?: string
  cashEnabled: boolean
  cardOnDeliveryEnabled: boolean
  ageRestrictedSales: boolean
  address: string
  city?: string
  state?: string
  openingHours?: OpeningHours
  open: boolean
  deliveryZones?: DeliveryZone[]
}

export type CartItem = {
  product: Product
  quantity: number
}

export type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'out_for_delivery' | 'ready' | 'completed' | 'cancelled'

export type DemoOrder = {
  id: string
  customer: string
  total: number
  status: OrderStatus
  type: 'delivery' | 'pickup'
  createdAt: string
}
