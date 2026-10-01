import QRCode from 'npm:qrcode@1.5.4'
import { corsHeaders, json, loadOrderBundle } from '../_shared/common.ts'

function field(id: string, value: string) {
  const length = new TextEncoder().encode(value).length
  return `${id}${String(length).padStart(2, '0')}${value}`
}

function sanitize(value: string, max: number) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .\-]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, max) || 'PEDEVO'
}

function normalizePixKey(value: string) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.includes('@')) return raw.toLowerCase()
  const digits = raw.replace(/\D/g, '')
  if (/^\+?\d[\d\s().-]+$/.test(raw) && (digits.length === 10 || digits.length === 11)) return `+55${digits}`
  if (/^\+?\d[\d\s().-]+$/.test(raw) && digits.length === 13 && digits.startsWith('55')) return `+${digits}`
  if (digits.length === 11 || digits.length === 14) return digits
  return raw
}

function crc16(payload: string) {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function buildPixPayload(input: { key: string; amount: number; merchantName: string; merchantCity: string; txid: string }) {
  const key = normalizePixKey(input.key)
  const merchantAccount = field('00', 'br.gov.bcb.pix') + field('01', key)
  const amount = Number(input.amount || 0).toFixed(2)
  const txid = sanitize(input.txid.replace(/[^A-Za-z0-9]/g, ''), 25) || '***'
  const additional = field('05', txid)
  const partial = [
    field('00', '01'),
    field('01', '11'),
    field('26', merchantAccount),
    field('52', '0000'),
    field('53', '986'),
    field('54', amount),
    field('58', 'BR'),
    field('59', sanitize(input.merchantName, 25)),
    field('60', sanitize(input.merchantCity, 15)),
    field('62', additional),
    '6304',
  ].join('')
  return `${partial}${crc16(partial)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  try {
    const { orderId, trackingToken } = await req.json()
    if (!orderId || !trackingToken) return json({ error: 'Pedido inválido.' }, 400)
    const { supabase, order, store } = await loadOrderBundle(String(orderId))
    if (String(order.public_tracking_token) !== String(trackingToken)) return json({ error: 'Pedido inválido.' }, 403)
    if (order.payment_method !== 'pix') return json({ error: 'Este pedido não é Pix.' }, 400)
    if (store?.pix_auto_enabled) return json({ error: 'Esta loja está usando Pix automático.' }, 409)
    if (!store?.pix_key) return json({ error: 'A loja ainda não cadastrou uma chave Pix para o modo manual.' }, 409)
    if (order.pix_copy_paste && order.payment_status === 'manual_pending') return json({
      ok: true,
      alreadyCreated: true,
      expiresAt: order.payment_expires_at,
      pixCopyPaste: order.pix_copy_paste,
      qrCodeBase64: order.pix_qr_code_base64,
    })

    const txid = String(order.order_number || order.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 25)
    const payload = buildPixPayload({
      key: String(store.pix_key),
      amount: Number(order.total),
      merchantName: String(store.name || 'Pedevo'),
      merchantCity: String(store.city || 'Brasil'),
      txid,
    })
    // SVG evita dependências de renderização PNG/Canvas no runtime da Edge Function.
    const qrSvg = await QRCode.toString(payload, { type: 'svg', width: 320, margin: 2, errorCorrectionLevel: 'M' })
    const qrDataUrl = `data:image/svg+xml;base64,${btoa(qrSvg)}`
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: updateError } = await supabase.from('orders').update({
      payment_status: 'manual_pending',
      payment_provider: 'manual_pix',
      payment_provider_id: null,
      payment_expires_at: expiresAt,
      pix_copy_paste: payload,
      pix_qr_code_base64: qrDataUrl,
    }).eq('id', order.id)
    if (updateError) throw updateError
    return json({ ok: true, expiresAt, pixCopyPaste: payload, qrCodeBase64: qrDataUrl })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500)
  }
})
