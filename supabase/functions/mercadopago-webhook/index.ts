import { json, loadOrderBundle, merchantAccessToken, moneyBR, sendWhatsappTemplate, serviceClient } from '../_shared/common.ts'

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifySignature(req: Request, dataId: string) {
  const secret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET')
  if (!secret) return true // permitido apenas para teste; configure em produção.
  const signature = req.headers.get('x-signature') || ''
  const requestId = req.headers.get('x-request-id') || ''
  const parts = Object.fromEntries(signature.split(',').map((part) => part.trim().split('=')))
  const ts = parts.ts || ''
  const v1 = parts.v1 || ''
  if (!ts || !v1) return false
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest))
  return hex(digest) === v1.toLowerCase()
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const body = await req.json().catch(() => ({}))
    const dataId = String(url.searchParams.get('data.id') || body?.data?.id || '')
    if (!dataId) return json({ ok: true })
    if (!(await verifySignature(req, dataId))) return json({ error: 'invalid_signature' }, 401)

    const supabase = serviceClient()
    const { data: order } = await supabase.from('orders').select('id,store_id,payment_provider_id').eq('payment_provider_id', dataId).maybeSingle()
    if (!order) return json({ ok: true, ignored: true })
    const accessToken = await merchantAccessToken(order.store_id)
    if (!accessToken) return json({ error: 'merchant_token_missing' }, 500)

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const payment = await response.json().catch(() => ({}))
    if (!response.ok) return json({ error: 'payment_lookup_failed' }, 502)

    if (payment.status === 'approved') {
      await supabase.from('orders').update({ payment_status: 'paid', paid_at: new Date().toISOString(), status: 'preparing' }).eq('id', order.id)
      const { order: fullOrder, store, customer } = await loadOrderBundle(order.id)
      const template = Deno.env.get('WHATSAPP_TEMPLATE_PAYMENT_APPROVED') || ''
      if (template && customer?.whatsapp) {
        try {
          await sendWhatsappTemplate({
            to: customer.whatsapp,
            templateName: template,
            params: [String(store?.name || 'Loja'), String(fullOrder.order_number || String(fullOrder.id).slice(0,8)), moneyBR(Number(fullOrder.total))],
          })
          await supabase.from('orders').update({ whatsapp_payment_sent_at: new Date().toISOString() }).eq('id', order.id)
        } catch { /* não falha o webhook */ }
      }
    } else if (['cancelled','rejected','refunded','charged_back'].includes(payment.status)) {
      await supabase.from('orders').update({ payment_status: payment.status === 'cancelled' ? 'cancelled' : 'failed', status: 'cancelled' }).eq('id', order.id)
    }
    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'webhook_error' }, 500)
  }
})
