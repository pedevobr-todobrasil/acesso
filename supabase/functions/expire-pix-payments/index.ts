import { json, merchantAccessToken, serviceClient } from '../_shared/common.ts'

Deno.serve(async (req) => {
  const expected = Deno.env.get('CRON_SECRET') || ''
  const received = req.headers.get('x-cron-secret') || ''
  if (!expected || received !== expected) return json({ error: 'unauthorized' }, 401)

  const supabase = serviceClient()
  const { data: rows, error } = await supabase.rpc('list_expired_pix_orders')
  if (error) return json({ error: error.message }, 500)
  let expired = 0
  for (const row of rows || []) {
    if (row.payment_provider_id) {
      const accessToken = await merchantAccessToken(row.store_id)
      if (accessToken && row.payment_provider_id) {
        try {
          await fetch(`https://api.mercadopago.com/v1/payments/${row.payment_provider_id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'cancelled' }),
          })
        } catch { /* ainda marcamos internamente como expirado */ }
      }
    }
    await supabase.from('orders').update({ payment_status: 'expired', status: 'cancelled' }).eq('id', row.order_id).in('payment_status', ['pending','manual_pending'])
    expired += 1
  }
  return json({ ok: true, expired })
})
