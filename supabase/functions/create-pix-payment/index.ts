import { corsHeaders, itemsSummary, json, loadOrderBundle, merchantAccessToken, moneyBR, paymentLabel, receiptSummary, sendWhatsappTemplate } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  try {
    const { orderId, trackingToken, payerEmail, payerDocument } = await req.json()
    if (!orderId || !trackingToken || !payerEmail || !payerDocument) return json({ error: 'Dados incompletos para gerar Pix.' }, 400)
    const cpf = String(payerDocument).replace(/\D/g, '')
    if (cpf.length !== 11) return json({ error: 'CPF inválido.' }, 400)

    const { supabase, order, store, customer, items } = await loadOrderBundle(String(orderId))
    if (String(order.public_tracking_token) !== String(trackingToken)) return json({ error: 'Pedido inválido.' }, 403)
    if (order.payment_method !== 'pix') return json({ error: 'Este pedido não é Pix.' }, 400)
    if (!store?.pix_auto_enabled) {
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id)
      return json({ error: 'Pix automático não está ativo nesta loja.' }, 409)
    }
    if (order.payment_provider_id && order.pix_copy_paste) {
      return json({ ok: true, alreadyCreated: true, paymentId: order.payment_provider_id })
    }

    const accessToken = await merchantAccessToken(order.store_id)
    if (!accessToken) {
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id)
      return json({ error: 'A loja ainda não conectou o Mercado Pago.' }, 409)
    }

    const providerExpiration = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const internalExpiration = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const notificationUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mercadopago-webhook`
    const firstName = String(customer?.name || 'Cliente').trim().split(/\s+/)[0] || 'Cliente'

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': String(order.id),
      },
      body: JSON.stringify({
        transaction_amount: Number(order.total),
        description: `${store?.name || 'Pedevo'} - Pedido #${order.order_number || String(order.id).slice(0, 8)}`,
        payment_method_id: 'pix',
        external_reference: String(order.id),
        notification_url: notificationUrl,
        date_of_expiration: providerExpiration,
        payer: {
          email: String(payerEmail).trim().toLowerCase(),
          first_name: firstName,
          identification: { type: 'CPF', number: cpf },
        },
      }),
    })
    const mp = await mpResponse.json().catch(() => ({}))
    if (!mpResponse.ok) {
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id)
      return json({ error: mp?.message || mp?.cause?.[0]?.description || 'Mercado Pago recusou a criação do Pix.' }, 502)
    }
    const tx = mp?.point_of_interaction?.transaction_data || {}
    if (!tx.qr_code || !tx.qr_code_base64) {
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id)
      return json({ error: 'O provedor não retornou o QR Code Pix.' }, 502)
    }

    await supabase.from('orders').update({
      payment_status: 'pending',
      payment_provider: 'mercado_pago',
      payment_provider_id: String(mp.id),
      payment_expires_at: internalExpiration,
      pix_copy_paste: tx.qr_code,
      pix_qr_code_base64: tx.qr_code_base64,
    }).eq('id', order.id)

    const template = Deno.env.get('WHATSAPP_TEMPLATE_ORDER_RECEIVED') || ''
    if (template && customer?.whatsapp) {
      try {
        await sendWhatsappTemplate({
          to: customer.whatsapp,
          templateName: template,
          params: [String(store?.name || 'Loja'), String(order.order_number || String(order.id).slice(0, 8)), String(customer?.name || 'Cliente'), itemsSummary(items), moneyBR(Number(order.total)), paymentLabel(order.payment_method), receiptSummary(order)],
        })
        await supabase.from('orders').update({ whatsapp_order_sent_at: new Date().toISOString() }).eq('id', order.id)
      } catch { /* WhatsApp não bloqueia o pedido */ }
    }

    return json({ ok: true, paymentId: String(mp.id), expiresAt: internalExpiration })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500)
  }
})
