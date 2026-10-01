import { corsHeaders, itemsSummary, json, loadOrderBundle, moneyBR, paymentLabel, receiptSummary, sendWhatsappTemplate, serviceClient } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json()
    const orderId = String(body.orderId || '')
    const event = String(body.event || '')
    const trackingToken = String(body.trackingToken || '')
    if (!orderId || !['order_received','payment_approved','out_for_delivery'].includes(event)) return json({ error: 'Evento inválido.' }, 400)

    const { supabase, order, store, customer, items } = await loadOrderBundle(orderId)
    if (event === 'order_received') {
      if (!trackingToken || String(order.public_tracking_token) !== trackingToken) return json({ error: 'Pedido inválido.' }, 403)
    } else {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
      if (!jwt) return json({ error: 'Faça login novamente.' }, 401)
      const service = serviceClient()
      const { data: authData } = await service.auth.getUser(jwt)
      if (!authData.user || authData.user.id !== store?.owner_id) return json({ error: 'Sem permissão.' }, 403)
    }

    if (!customer?.whatsapp) return json({ ok: true, skipped: true, reason: 'customer_without_whatsapp' })
    let template = ''
    let params: string[] = []
    let sentField = ''
    if (event === 'order_received') {
      template = Deno.env.get('WHATSAPP_TEMPLATE_ORDER_RECEIVED') || ''
      params = [String(store?.name || 'Loja'), String(order.order_number || String(order.id).slice(0,8)), String(customer?.name || 'Cliente'), itemsSummary(items), moneyBR(Number(order.total)), paymentLabel(order.payment_method), receiptSummary(order)]
      sentField = 'whatsapp_order_sent_at'
    }
    if (event === 'payment_approved') {
      template = Deno.env.get('WHATSAPP_TEMPLATE_PAYMENT_APPROVED') || ''
      params = [String(store?.name || 'Loja'), String(order.order_number || String(order.id).slice(0,8)), moneyBR(Number(order.total))]
      sentField = 'whatsapp_payment_sent_at'
    }
    if (event === 'out_for_delivery') {
      template = Deno.env.get('WHATSAPP_TEMPLATE_OUT_FOR_DELIVERY') || ''
      params = [String(store?.name || 'Loja'), String(order.order_number || String(order.id).slice(0,8))]
      sentField = 'whatsapp_delivery_sent_at'
    }
    if (!template) return json({ ok: true, skipped: true, reason: 'template_not_configured' })

    const result = await sendWhatsappTemplate({ to: customer.whatsapp, templateName: template, params })
    if (!result.skipped && sentField) await supabase.from('orders').update({ [sentField]: new Date().toISOString() }).eq('id', order.id)
    return json({ ok: true, ...result })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500)
  }
})
