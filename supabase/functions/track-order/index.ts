import { corsHeaders, json, loadOrderBundle } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const { orderId, trackingToken } = await req.json()
    if (!orderId || !trackingToken) return json({ error: 'Pedido inválido.' }, 400)

    const { order, store, customer, items } = await loadOrderBundle(String(orderId))
    if (String(order.public_tracking_token || '') !== String(trackingToken)) {
      return json({ error: 'Pedido inválido.' }, 403)
    }

    return json({
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      payment_expires_at: order.payment_expires_at,
      pix_copy_paste: order.pix_copy_paste,
      pix_qr_code_base64: order.pix_qr_code_base64,
      subtotal: Number(order.subtotal || 0),
      delivery_fee: Number(order.delivery_fee || 0),
      total: Number(order.total || 0),
      order_type: order.order_type,
      delivery_address: order.delivery_address,
      notes: order.notes,
      created_at: order.created_at,
      paid_at: order.paid_at,
      store: store ? {
        name: store.name,
        whatsapp: store.whatsapp,
        slug: store.slug,
        primary_color: store.primary_color,
      } : null,
      customer: customer ? {
        name: customer.name,
        whatsapp: customer.whatsapp,
      } : null,
      items: (items || []).map((item: any) => ({
        product_name: item.product_name,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        total: Number(item.total || 0),
      })),
    })
  } catch (error) {
    console.error('track-order error', error)
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500)
  }
})
