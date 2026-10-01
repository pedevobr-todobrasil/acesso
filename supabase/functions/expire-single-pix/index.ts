import { corsHeaders, json, loadOrderBundle, merchantAccessToken } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  try {
    const { orderId, trackingToken } = await req.json()
    if (!orderId || !trackingToken) return json({ error: 'Pedido inválido.' }, 400)
    const { supabase, order } = await loadOrderBundle(String(orderId))
    if (String(order.public_tracking_token) !== String(trackingToken)) return json({ error: 'Pedido inválido.' }, 403)
    if (order.payment_method !== 'pix' || !['pending','manual_pending'].includes(String(order.payment_status))) return json({ ok: true, skipped: true })
    if (!order.payment_expires_at || new Date(order.payment_expires_at).getTime() > Date.now()) return json({ error: 'O prazo do Pix ainda não terminou.' }, 409)

    if (order.payment_status === 'pending') {
      const accessToken = await merchantAccessToken(order.store_id)
      if (accessToken && order.payment_provider_id) {
        try {
          await fetch(`https://api.mercadopago.com/v1/payments/${order.payment_provider_id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'cancelled' }),
          })
        } catch { /* o cron fará nova tentativa; o pedido ainda expira internamente */ }
      }
    }

    await supabase.from('orders').update({ payment_status: 'expired', status: 'cancelled' }).eq('id', order.id).eq('payment_status', order.payment_status)
    return json({ ok: true, expired: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500)
  }
})
