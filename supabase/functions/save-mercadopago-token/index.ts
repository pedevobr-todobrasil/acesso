import { corsHeaders, json, serviceClient } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = req.headers.get('Authorization') || ''
    const jwt = authorization.replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'Faça login novamente.' }, 401)
    const { storeId, accessToken } = await req.json()
    if (!storeId || !String(accessToken || '').trim()) return json({ error: 'Informe o Access Token.' }, 400)

    const supabase = serviceClient()
    const { data: authData, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !authData.user) return json({ error: 'Sessão inválida.' }, 401)
    const { data: store } = await supabase.from('stores').select('id,owner_id').eq('id', storeId).maybeSingle()
    if (!store || store.owner_id !== authData.user.id) return json({ error: 'Você não pode alterar esta loja.' }, 403)

    const token = String(accessToken).trim()
    const test = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${token}` } })
    if (!test.ok) return json({ error: 'Access Token do Mercado Pago inválido.' }, 400)

    const { error } = await supabase.from('store_payment_credentials').upsert({
      store_id: storeId,
      provider: 'mercado_pago',
      access_token: token,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'store_id' })
    if (error) return json({ error: error.message }, 500)
    await supabase.from('stores').update({ pix_auto_enabled: true, pix_enabled: true }).eq('id', storeId)
    return json({ ok: true, connected: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500)
  }
})
