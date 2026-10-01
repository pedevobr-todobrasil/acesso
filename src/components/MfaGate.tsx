import { type ReactNode, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type GateState = 'loading' | 'allowed' | 'login' | 'mfa' | 'admin' | 'onboarding'

export default function MfaGate({ children, area }: { children: ReactNode; area: 'owner' | 'admin' }) {
  const location = useLocation()
  const [state, setState] = useState<GateState>('loading')

  useEffect(() => {
    let mounted = true

    async function check() {
      if (!supabase) { if (mounted) setState('allowed'); return }

      const sessionResult = await supabase.auth.getSession()
      if (!mounted) return
      if (!sessionResult.data.session) { setState('login'); return }

      const mfa = (supabase.auth as any).mfa
      if (mfa?.getAuthenticatorAssuranceLevel) {
        const aal = await mfa.getAuthenticatorAssuranceLevel()
        if (!mounted) return
        if (!aal.error && aal.data?.nextLevel === 'aal2' && aal.data?.currentLevel !== 'aal2') {
          setState('mfa')
          return
        }
      }

      if (area === 'owner') {
        // Primeiro confirmamos se a conta é realmente dona de uma loja.
        // Se for, ela sempre pode entrar no painel do lojista por /entrar.
        const ownerCheck = await supabase.rpc('is_store_owner')
        if (!mounted) return
        if (!ownerCheck.error && ownerCheck.data) {
          setState('allowed')
          return
        }

        // O onboarding precisa continuar disponível para uma conta nova que
        // ainda não criou a primeira loja.
        if (location.pathname.startsWith('/onboarding')) {
          setState('allowed')
          return
        }

        // Só redirecionamos ao Master quando NÃO existe loja desse usuário.
        const adminCheck = await supabase.rpc('is_pedevo_admin')
        if (!mounted) return
        if (!adminCheck.error && adminCheck.data) {
          setState('admin')
          return
        }

        setState('onboarding')
        return
      }

      // A autorização final da área Master continua sendo validada dentro do
      // SaaSAdmin com is_pedevo_admin(). Aqui cuidamos apenas da sessão/MFA.
      setState('allowed')
    }

    check()
    return () => { mounted = false }
  }, [area, location.pathname])

  if (state === 'loading') return <div className="securityGateLoading">Verificando segurança da conta...</div>
  if (state === 'login') return <Navigate to={area === 'admin' ? '/admin/entrar' : '/entrar'} replace />
  if (state === 'admin') return <Navigate to="/admin" replace />
  if (state === 'onboarding') return <Navigate to="/onboarding" replace />
  if (state === 'mfa') {
    const next = area === 'admin' ? '/admin' : location.pathname
    return <Navigate to={`/seguranca/verificar?next=${encodeURIComponent(next)}`} replace />
  }
  return <>{children}</>
}
