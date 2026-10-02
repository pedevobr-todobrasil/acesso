import { CheckCircle2, KeyRound, LockKeyhole, Mail, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type PendingFactor = {
  id: string
  type: 'totp' | 'phone'
  qr?: string
  secret?: string
  challengeId?: string
  phone?: string
  channel?: 'sms' | 'whatsapp'
}

function factorType(factor: any) {
  return String(factor?.factor_type || factor?.type || '').toLowerCase()
}

function qrSource(value?: string) {
  if (!value) return ''
  if (value.trim().startsWith('<svg')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`
  return value
}

export default function SecuritySettings({ compact = false, logoutPath = '/entrar' }: { compact?: boolean; logoutPath?: string }) {
  const [user, setUser] = useState<any>(null)
  const [factors, setFactors] = useState<any[]>([])
  const [pending, setPending] = useState<PendingFactor | null>(null)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [emailWorking, setEmailWorking] = useState(false)
  const [passwordWorking, setPasswordWorking] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load() {
    if (!supabase) { setLoading(false); return }
    setError('')
    const [userResult, factorsResult] = await Promise.all([
      supabase.auth.getUser(),
      (supabase.auth as any).mfa.listFactors(),
    ])
    if (userResult.error) setError(userResult.error.message)
    setUser(userResult.data.user || null)
    setNewEmail(userResult.data.user?.email || '')
    const data = factorsResult.data || {}
    const all = data.all || [...(data.totp || []), ...(data.phone || [])]
    setFactors(all.filter((item: any) => item.status === 'verified'))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const hasTotp = useMemo(() => factors.some((item) => factorType(item) === 'totp'), [factors])
  const hasPhone = useMemo(() => factors.some((item) => factorType(item) === 'phone'), [factors])

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setError(''); setSuccess('')
    if (newPassword.length < 8) { setError('A nova senha precisa ter pelo menos 8 caracteres.'); return }
    if (newPassword !== confirmPassword) { setError('A confirmação da senha não confere.'); return }
    setPasswordWorking(true)
    const result = await supabase.auth.updateUser({ password: newPassword })
    if (result.error) {
      setError(result.error.message)
      setPasswordWorking(false)
      return
    }
    setNewPassword(''); setConfirmPassword('')
    await supabase.auth.signOut({ scope: 'global' })
    window.location.hash = `#${logoutPath}`
  }

  async function changeEmail(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !user?.email) return
    setError(''); setSuccess('')
    const normalized = newEmail.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalized)) { setError('Informe um e-mail válido.'); return }
    if (normalized === String(user.email).toLowerCase()) { setError('Digite um e-mail diferente do atual.'); return }
    setEmailWorking(true)
    const result = await supabase.auth.updateUser({ email: normalized })
    if (result.error) setError(result.error.message)
    else setSuccess('Solicitação enviada. Confirme a alteração pelos e-mails de segurança enviados pelo Supabase. Depois da confirmação, use o novo e-mail no próximo login.')
    setEmailWorking(false)
  }

  async function resendEmailConfirmation() {
    if (!supabase || !user?.email) return
    setWorking(true); setError(''); setSuccess('')
    const result = await supabase.auth.resend({ type: 'signup', email: user.email })
    if (result.error) setError(result.error.message)
    else setSuccess('Enviamos um novo e-mail de confirmação.')
    setWorking(false)
  }

  async function beginTotp() {
    if (!supabase) return
    setWorking(true); setError(''); setSuccess(''); setCode('')
    const result = await (supabase.auth as any).mfa.enroll({ factorType: 'totp', friendlyName: 'Pedevo Authenticator' })
    if (result.error) setError(result.error.message)
    else setPending({ id: result.data.id, type: 'totp', qr: result.data.totp?.qr_code, secret: result.data.totp?.secret })
    setWorking(false)
  }

  async function beginPhone(channel: 'sms' | 'whatsapp') {
    if (!supabase) return
    const normalized = phone.replace(/[^\d+]/g, '')
    if (!/^\+\d{10,15}$/.test(normalized)) {
      setError('Informe o telefone com código do país. Ex.: +5563999999999')
      return
    }
    setWorking(true); setError(''); setSuccess(''); setCode('')
    const enroll = await (supabase.auth as any).mfa.enroll({ factorType: 'phone', friendlyName: 'Pedevo Telefone', phone: normalized })
    if (enroll.error) { setError(enroll.error.message); setWorking(false); return }
    const challenge = await (supabase.auth as any).mfa.challenge({ factorId: enroll.data.id, ...(channel === 'whatsapp' ? { channel: 'whatsapp' } : {}) })
    if (challenge.error) { setError(challenge.error.message); setWorking(false); return }
    setPending({ id: enroll.data.id, type: 'phone', challengeId: challenge.data.id, phone: normalized, channel })
    setWorking(false)
  }

  async function verifyPending(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !pending || !code.trim()) return
    setWorking(true); setError(''); setSuccess('')
    let result: any
    if (pending.type === 'totp') {
      result = await (supabase.auth as any).mfa.challengeAndVerify({ factorId: pending.id, code: code.trim() })
    } else {
      result = await (supabase.auth as any).mfa.verify({ factorId: pending.id, challengeId: pending.challengeId, code: code.trim() })
    }
    if (result.error) setError(result.error.message)
    else {
      setSuccess(pending.type === 'totp' ? '2FA pelo aplicativo autenticador ativado.' : `2FA por ${pending.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} ativado.`)
      setPending(null); setCode(''); await load()
    }
    setWorking(false)
  }

  async function removeFactor(factor: any) {
    if (!supabase) return
    if (!confirm('Desativar este segundo fator?')) return
    setWorking(true); setError(''); setSuccess('')
    const result = await (supabase.auth as any).mfa.unenroll({ factorId: factor.id })
    if (result.error) setError(result.error.message)
    else { setSuccess('Segundo fator removido.'); await load() }
    setWorking(false)
  }

  if (loading) return <section className="panelCard"><p>Carregando segurança...</p></section>

  return <section className={`panelCard securitySettings ${compact ? 'compact' : ''}`}>
    <div className="panelTitle"><div><h2>Segurança da conta</h2><p>Troque sua senha e ative proteções extras quando desejar.</p></div><span className="securityRecommended"><ShieldCheck size={16}/> Opcional e recomendado</span></div>
    {error && <div className="infoAlert">{error}</div>}
    {success && <div className="successAlert">{success}</div>}

    <div className="securityOptionGrid">
      <article className="securityOptionCard emailSecurityCard">
        <div className="securityOptionIcon"><Mail/></div>
        <div><strong>E-mail / usuário de acesso</strong><span>Atual: {user?.email || 'Não informado'}</span><small>Ao trocar o e-mail, o Supabase envia confirmações de segurança. O novo endereço passa a ser seu usuário de login depois da confirmação.</small></div>
        <div className="securityActions">{user?.email_confirmed_at ? <span className="securityOk"><CheckCircle2/> Confirmado</span> : <><span className="securityNeutral">Pendente</span><button className="miniButton" disabled={working} onClick={resendEmailConfirmation}>Reenviar confirmação</button></>}</div>
        <form className="emailChangeForm" onSubmit={changeEmail}><input type="email" autoComplete="email" value={newEmail} onChange={(e)=>setNewEmail(e.target.value)} placeholder="novo@email.com" required/><button className="button secondary" disabled={emailWorking}>{emailWorking ? 'Enviando...' : 'Alterar e-mail'}</button></form>
      </article>

      <article className="securityOptionCard passwordSecurityCard">
        <div className="securityOptionIcon"><LockKeyhole/></div>
        <div><strong>Trocar senha</strong><span>Defina uma nova senha para entrar no painel.</span><small>Depois da alteração, o Pedevo encerra a sessão automaticamente e você deverá entrar novamente com a nova senha.</small></div>
        <form className="passwordChangeForm" onSubmit={changePassword}><input type="password" autoComplete="new-password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} placeholder="Nova senha"/><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} placeholder="Confirmar nova senha"/><button className="button secondary" disabled={passwordWorking}>{passwordWorking ? 'Alterando...' : 'Alterar senha'}</button></form>
      </article>

      <article className="securityOptionCard">
        <div className="securityOptionIcon"><KeyRound/></div>
        <div><strong>Aplicativo autenticador (2FA)</strong><span>Google Authenticator, Authy, 1Password e similares.</span><small>Depois do e-mail e senha, será solicitado um código temporário.</small></div>
        {hasTotp ? <div className="securityActions"><span className="securityOk"><CheckCircle2/> Ativo</span>{factors.filter((f)=>factorType(f)==='totp').map((factor)=><button key={factor.id} className="miniButton dangerMiniButton" disabled={working} onClick={()=>removeFactor(factor)}><Trash2 size={14}/> Remover</button>)}</div> : <button className="button secondary" disabled={working} onClick={beginTotp}>Ativar 2FA</button>}
      </article>

      <article className="securityOptionCard phoneSecurityCard">
        <div className="securityOptionIcon"><Smartphone/></div>
        <div><strong>Código no telefone (2FA)</strong><span>Receba o segundo código por SMS ou WhatsApp.</span><small>Requer um provedor de mensagens configurado em Authentication no Supabase.</small></div>
        {hasPhone ? <div className="securityActions"><span className="securityOk"><CheckCircle2/> Ativo</span>{factors.filter((f)=>factorType(f)==='phone').map((factor)=><button key={factor.id} className="miniButton dangerMiniButton" disabled={working} onClick={()=>removeFactor(factor)}><Trash2 size={14}/> Remover</button>)}</div> : <div className="securityPhoneEnroll"><input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="+5563999999999"/><button className="button secondary" disabled={working} onClick={()=>beginPhone('sms')}>Enviar por SMS</button><button className="button secondary" disabled={working} onClick={()=>beginPhone('whatsapp')}>Enviar por WhatsApp</button></div>}
      </article>
    </div>

    {pending && <div className="securityEnrollBox">
      <div><h3>{pending.type === 'totp' ? 'Conecte seu aplicativo autenticador' : 'Confirme seu telefone'}</h3><p>{pending.type === 'totp' ? 'Escaneie o QR Code e informe o código de 6 dígitos para concluir.' : `Enviamos um código por ${pending.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} para ${pending.phone}. Digite-o abaixo.`}</p></div>
      {pending.type === 'totp' && pending.qr && <div className="securityQr"><img src={qrSource(pending.qr)} alt="QR Code do 2FA"/><div><span>Chave manual</span><code>{pending.secret}</code></div></div>}
      <form onSubmit={verifyPending} className="securityVerifyForm"><input value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,'').slice(0,8))} inputMode="numeric" placeholder="Código de verificação" required/><button className="button" disabled={working}>{working ? 'Verificando...' : 'Confirmar e ativar'}</button><button type="button" className="button secondary" onClick={()=>{setPending(null);setCode('')}}>Cancelar</button></form>
    </div>}

    <p className="securityFootnote">E-mail confirmado protege a recuperação da conta, mas não conta como MFA. Os segundos fatores reais disponíveis aqui são aplicativo autenticador e telefone (SMS/WhatsApp). Cada lojista escolhe se deseja ativá-los.</p>
  </section>
}
