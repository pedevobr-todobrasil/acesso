import { ArrowLeft, CheckCircle2, Lock, Mail, UserRound } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Brand from '../components/Brand'
import { signIn, signUp } from '../lib/auth'
import { supabase, supabaseConfigured } from '../lib/supabase'

export default function Auth({ mode, area = 'owner' }: { mode: 'login' | 'signup'; area?: 'owner' | 'admin' }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '')
    const password = String(form.get('password') || '')
    const name = String(form.get('name') || '')

    if (mode === 'signup') {
      const result = await signUp(email, password, name)
      setLoading(false)
      if (result.error) return setError(result.error.message)
      if (result.demo) return navigate('/onboarding')
      setMessage('Conta criada. Se a confirmação por e-mail estiver ativada no Supabase, confirme seu e-mail antes de entrar.')
    } else {
      const result = await signIn(email, password)
      setLoading(false)
      if (result.error) return setError(result.error.message)
      if (area === 'admin') {
        if (!supabase) return setError('Supabase não configurado.')
        const adminCheck = await supabase.rpc('is_pedevo_admin')
        if (adminCheck.error) return setError(adminCheck.error.message)
        if (!adminCheck.data) {
          await supabase.auth.signOut()
          return setError('Esta conta não possui permissão de administrador do Pedevo.')
        }
        navigate('/admin')
        return
      }
      navigate('/painel')
    }
  }

  return <div className="authPage">
    <div className="authVisual">
      <Link to={area === 'admin' ? '/admin' : '/'} className="backHome"><ArrowLeft size={18}/> Voltar</Link>
      <div className="authVisualContent"><Brand/><h1>{mode === 'signup' ? 'Coloque seu negócio para vender online.' : 'Bem-vindo de volta.'}</h1><p>{mode === 'signup' ? 'Crie sua loja, cadastre seus produtos e comece a receber pedidos de delivery e retirada.' : 'Entre para acompanhar pedidos, produtos, clientes e vendas.'}</p><ul><li><CheckCircle2/> Configuração fácil</li><li><CheckCircle2/> Funciona no celular e computador</li><li><CheckCircle2/> Ideal para pequenos negócios</li></ul></div>
    </div>
    <div className="authFormSide"><div className="authFormCard"><div className="authMobileBrand"><Brand/></div><span className="eyebrow">{mode === 'signup' ? 'Comece agora' : area === 'admin' ? 'Administração Pedevo' : 'Área do lojista'}</span><h2>{mode === 'signup' ? 'Crie sua conta' : area === 'admin' ? 'Entrar no Painel Master' : 'Entrar no Pedevo'}</h2><p>{mode === 'signup' ? 'Você configura a loja depois do cadastro.' : area === 'admin' ? 'Use uma conta cadastrada como administradora.' : 'Use seu e-mail e senha.'}</p>
      {!supabaseConfigured && <div className="demoBanner">Modo demonstração: Supabase ainda não configurado. Qualquer e-mail e senha permitem testar as telas.</div>}
      <form onSubmit={handleSubmit}>
        {mode === 'signup' && <label>Seu nome<div className="inputWithIcon"><UserRound/><input name="name" required placeholder="Seu nome completo"/></div></label>}
        <label>E-mail<div className="inputWithIcon"><Mail/><input name="email" type="email" required placeholder="voce@email.com"/></div></label>
        <label>Senha<div className="inputWithIcon"><Lock/><input name="password" type="password" minLength={6} required placeholder="Mínimo 6 caracteres"/></div></label>
        {error && <div className="formError">{error}</div>}{message && <div className="formSuccess">{message}</div>}
        <button className="button large full" disabled={loading}>{loading ? 'Aguarde...' : mode === 'signup' ? 'Criar minha conta' : 'Entrar'}</button>
      </form>
      {area !== 'admin' && <p className="authSwitch">{mode === 'signup' ? <>Já tem uma conta? <Link to="/entrar">Entrar</Link></> : <>Ainda não tem conta? <Link to="/cadastro">Criar conta</Link></>}</p>}
      {area === 'admin' && <p className="authSwitch"><Link to="/entrar">Entrar como lojista</Link></p>}
    </div></div>
  </div>
}
