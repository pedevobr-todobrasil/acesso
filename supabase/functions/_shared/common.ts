import { createClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')!

  // Projetos novos do Supabase usam SUPABASE_SECRET_KEYS (JSON).
  // Mantemos fallback para SUPABASE_SERVICE_ROLE_KEY por compatibilidade
  // com projetos que ainda usam as chaves legadas.
  let key = ''
  const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (secretKeysRaw) {
    try {
      const secretKeys = JSON.parse(secretKeysRaw)
      key = String(secretKeys?.default || '')
    } catch {
      key = ''
    }
  }
  if (!key) key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) throw new Error('Credencial administrativa do Supabase não está disponível na Edge Function.')

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function onlyDigits(value: string | null | undefined) {
  return String(value || '').replace(/\D/g, '')
}

export function whatsappPhone(value: string | null | undefined) {
  let digits = onlyDigits(value)
  if (!digits) return ''
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits
}

export function moneyBR(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}


export function paymentLabel(value: string | null | undefined) {
  if (value === 'pix') return 'Pix'
  if (value === 'cash') return 'Dinheiro'
  if (value === 'card_on_delivery') return 'Cartão na entrega/retirada'
  return String(value || 'Não informado')
}

export function itemsSummary(items: any[]) {
  const text = (items || []).map((item) => `${item.quantity}x ${item.product_name}`).join(', ')
  return text.length > 320 ? `${text.slice(0, 317)}...` : (text || 'Itens do pedido')
}

export function receiptSummary(order: any) {
  if (order?.order_type === 'pickup') return 'Retirada na loja'
  const a = order?.delivery_address || {}
  const line = [a.street, a.number].filter(Boolean).join(', ')
  const place = [a.neighborhood, a.city, a.state].filter(Boolean).join(' - ')
  const reference = a.reference ? ` | Ref.: ${a.reference}` : ''
  return `${line}${line && place ? ' | ' : ''}${place}${reference}`.slice(0, 420) || 'Delivery'
}

export async function sendWhatsappTemplate(input: {
  to: string
  templateName: string
  params: string[]
}) {
  const token = Deno.env.get('WHATSAPP_TOKEN')
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  const graphVersion = Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v23.0'
  const language = Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'pt_BR'
  const to = whatsappPhone(input.to)
  if (!token || !phoneId || !to || !input.templateName) {
    return { skipped: true, reason: 'whatsapp_not_configured' }
  }
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: language },
      components: [{
        type: 'body',
        parameters: input.params.map((text) => ({ type: 'text', text })),
      }],
    },
  }
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error?.message || 'Falha ao enviar WhatsApp')
  return { skipped: false, data }
}

export async function loadOrderBundle(orderId: string) {
  const supabase = serviceClient()
  const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle()
  if (error || !order) throw new Error(error?.message || 'Pedido não encontrado')
  const [{ data: store }, { data: customer }, { data: items }] = await Promise.all([
    supabase.from('stores').select('*').eq('id', order.store_id).maybeSingle(),
    supabase.from('customers').select('*').eq('id', order.customer_id).maybeSingle(),
    supabase.from('order_items').select('*').eq('order_id', order.id).order('created_at'),
  ])
  return { supabase, order, store, customer, items: items || [] }
}

export async function merchantAccessToken(storeId: string) {
  const supabase = serviceClient()
  const { data } = await supabase.from('store_payment_credentials').select('access_token').eq('store_id', storeId).maybeSingle()
  return data?.access_token || Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') || ''
}
