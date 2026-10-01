import { KeyRound, LogOut, Smartphone } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Brand from '../components/Brand'
import { supabase } from '../lib/supabase'

function factorType(factor: any) {
  return String(factor?.factor_type || factor?.type || '').toLowerCase()
}

export default function MfaVerify() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/painel'
  const [factors, setFactors] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [phoneChannel, setPhoneChannel] = useState<'sms' | 'whatsapp'>('sms')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!supabase) { navigate(next, { replace: true }); return }
      const aal = await (supabase.auth as any).mfa.getAuthenticatorAssuranceLevel()
      if (!mounted) return
      if (aal.data?.currentLevel === 'aal2' || aal.data?.nextLevel !== 'aal2') { navigate(next, { replace: true }); return }
      const result = await (supabase.auth as any).mfa.listFactors()
      if (!mounted) return
      if (result.error) { setError(result.error.message); setLoading(false); return }
      const data = result.data || {}
      const all = (data.all || [...(data.totp || []), ...(data.phone || [])]).filter((item: any)=>item.status === 'verified')
      setFactors(all)
      setSelectedId(all[0]?.id || '')
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [navigate, next])

  const selected = useMemo(() => factors.find((item)=>item.id===selectedId), [factors, selectedId])
  const selectedType = factorType(selected)

  async function sendPhoneCode(channel: 'sms' | 'whatsapp' = phoneChannel) {
    if (!supabase || !selected || selectedType !== 'phone') return
    setWorking(true); setError(''); setPhoneChannel(channel)
    const result = await (supabase.auth as any).mfa.challenge({ factorId: selected.id, ...(channel === 'whatsapp' ? { channel: 'whatsapp' } : {}) })
    if (result.error) setError(result.error.message)
    else setChallengeId(result.data.id)
    setWorking(false)
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !selected || !code.trim()) return
    setWorking(true); setError('')
    let result: any
    if (selectedType === 'phone') {
      let currentChallenge = challengeId
      if (!currentChallenge) {
        const challenge = await (supabase.auth as any).mfa.challenge({ factorId: selected.id, ...(phoneChannel === 'whatsapp' ? { channel: 'whatsapp' } : {}) })
        if (challenge.error) { setError(challenge.error.message); setWorking(false); return }
        currentChallenge = challenge.data.id
        setChallengeId(currentChallenge)
      }
      result = await (supabase.auth as any).mfa.verify({ factorId: selected.id, challengeId: currentChallenge, code: code.trim() })
    } else {
      result = await (supabase.auth as any).mfa.challengeAndVerify({ factorId: selected.id, code: code.trim() })
    }
    if (result.error) setError(result.error.message)
    else navigate(next, { replace: true })
    setWorking(false)
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    navigate(next.startsWith('/admin') ? '/admin/entrar' : '/entrar', { replace: true })
  }

  if (loading) return <div className="mfaPage"><div className="mfaCard"><Brand/><p>Verificando proteção da conta...</p></div></div>

  return <div className="mfaPage"><div className="mfaCard">
    <Brand/>
    <div className="mfaHeroIcon"><KeyRound/></div>
    <span className="eyebrow">Verificação em duas etapas</span>
    <h1>Confirme que é você</h1>
    <p>Esta conta ativou uma camada extra de segurança. Informe o código do segundo fator para continuar.</p>
    {factors.length > 1 && <label>Método<select value={selectedId} onChange={(e)=>{setSelectedId(e.target.value);setChallengeId('');setCode('')}}>{factors.map((factor)=><option key={factor.id} value={factor.id}>{factorType(factor)==='phone' ? `Telefone ${factor.phone || ''}` : 'Aplicativo autenticador'}</option>)}</select></label>}
    {selectedType === 'phone' && <div className="mfaPhoneChannels"><button className="button secondary" onClick={()=>sendPhoneCode('sms')} disabled={working}><Smartphone size={17}/> Código por SMS</button><button className="button secondary" onClick={()=>sendPhoneCode('whatsapp')} disabled={working}><Smartphone size={17}/> Código por WhatsApp</button>{challengeId && <small>Código enviado por {phoneChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.</small>}</div>}
    <form onSubmit={verify}><label>Código de segurança<input autoFocus value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,'').slice(0,8))} inputMode="numeric" placeholder="000000" required/></label>{error && <div className="formError">{error}</div>}<button className="button large full" disabled={working}>{working ? 'Verificando...' : 'Confirmar acesso'}</button></form>
    <button className="mfaSignOut" onClick={signOut}><LogOut size={16}/> Sair e usar outra conta</button>
  </div></div>
}
