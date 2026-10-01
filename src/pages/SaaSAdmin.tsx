import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  DollarSign,
  ExternalLink,
  Search,
  ShieldCheck,
  Store,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Brand from '../components/Brand'
import StatCard from '../components/StatCard'
import { formatBRL } from '../lib/format'
import { supabase } from '../lib/supabase'

type AdminSection = 'overview' | 'stores' | 'subscriptions' | 'finance'

function dateBR(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('pt-BR')
}

function daysLeft(value?: string | null) {
  if (!value) return 0
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000))
}

function statusText(row: any) {
  const status = row.subscription_status
  if (status === 'pending') return 'Adesão pendente'
  if (status === 'trial') return row.can_order ? `60 dias • ${daysLeft(row.included_until)}d` : 'Período encerrado'
  if (status === 'active') return row.can_order ? 'Mensal ativo' : 'Mensal vencido'
  if (status === 'overdue') return 'Em atraso'
  if (status === 'blocked') return 'Bloqueado'
  if (status === 'cancelled') return 'Cancelado'
  return 'Sem assinatura'
}

function statusTone(row: any) {
  if ((row.subscription_status === 'trial' || row.subscription_status === 'active') && row.can_order) return row.subscription_status
  if (row.subscription_status === 'pending') return 'pending'
  if (row.subscription_status === 'overdue' || !row.can_order) return row.subscription_status === 'blocked' ? 'blocked' : 'overdue'
  return 'blocked'
}

function businessLabel(value: string) {
  const labels: Record<string, string> = {
    deposito_bebidas: 'Depósito de bebidas',
    hamburgueria: 'Hamburgueria',
    pizzaria: 'Pizzaria',
    pastelaria: 'Pastelaria',
    doceria: 'Doceria',
    acai: 'Açaí',
    marmitaria: 'Marmitaria',
    restaurante: 'Restaurante',
    conveniencia: 'Conveniência',
    outro: 'Outro',
  }
  return labels[value] || value
}

function nextBillingDate(row: any) {
  return row.subscription_status === 'trial'
    ? row.included_until
    : row.current_period_end || row.next_charge_at
}

export default function SaaSAdmin() {
  const [section, setSection] = useState<AdminSection>('overview')
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selected, setSelected] = useState<any | null>(null)
  const [working, setWorking] = useState(false)

  async function load() {
    if (!supabase) {
      setError('Supabase não configurado.')
      setLoading(false)
      return
    }

    setError('')
    const session = await supabase.auth.getSession()
    if (!session.data.session) {
      setAuthorized(false)
      setLoading(false)
      return
    }

    const adminResult = await supabase.rpc('is_pedevo_admin')
    if (adminResult.error) {
      setError(adminResult.error.message)
      setAuthorized(false)
      setLoading(false)
      return
    }
    if (!adminResult.data) {
      setAuthorized(false)
      setLoading(false)
      return
    }

    setAuthorized(true)
    const result = await supabase.rpc('admin_subscription_overview')
    if (result.error) setError(result.error.message)
    else setRows(result.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(
    () => rows.filter((row) => `${row.store_name} ${row.business_type} ${row.owner_name} ${row.owner_email}`.toLowerCase().includes(query.toLowerCase())),
    [rows, query],
  )

  const activeCount = rows.filter((row) => (row.subscription_status === 'trial' || row.subscription_status === 'active') && row.can_order).length
  const monthlyActive = rows.filter((row) => row.subscription_status === 'active' && row.can_order)
  const mrr = monthlyActive.reduce((sum, row) => sum + Number(row.monthly_price || 0), 0)
  const pendingCount = rows.filter((row) => !row.can_order || ['pending', 'overdue', 'blocked'].includes(row.subscription_status)).length
  const signupRevenue = rows.filter((row) => row.signup_paid_at).reduce((sum, row) => sum + Number(row.signup_fee || 29.9), 0)
  const next30 = rows.filter((row) => {
    if (row.subscription_status !== 'active') return false
    const raw = nextBillingDate(row)
    if (!raw) return false
    const diff = new Date(raw).getTime() - Date.now()
    return diff >= 0 && diff <= 30 * 86400000
  })
  const next30Value = next30.reduce((sum, row) => sum + Number(row.monthly_price || 19.9), 0)
  const trialCount = rows.filter((row) => row.subscription_status === 'trial' && row.can_order).length
  const overdueCount = rows.filter((row) => ['overdue', 'blocked'].includes(row.subscription_status) || ((row.subscription_status === 'trial' || row.subscription_status === 'active') && !row.can_order)).length

  async function runAction(action: 'activate' | 'monthly' | 'overdue' | 'blocked' | 'cancelled') {
    if (!supabase || !selected) return
    setWorking(true)
    setError('')
    setSuccess('')

    let result: any
    if (action === 'activate') result = await supabase.rpc('admin_activate_subscription', { p_store_id: selected.store_id })
    else if (action === 'monthly') result = await supabase.rpc('admin_register_monthly_payment', { p_store_id: selected.store_id })
    else result = await supabase.rpc('admin_set_subscription_status', { p_store_id: selected.store_id, p_status: action })

    if (result.error) setError(result.error.message)
    else {
      setSuccess(
        action === 'activate'
          ? 'Adesão confirmada e 60 dias liberados.'
          : action === 'monthly'
            ? 'Mensalidade registrada e acesso renovado.'
            : `Status atualizado para ${action}.`,
      )
      await load()
      const refreshed = (await supabase.rpc('admin_subscription_overview')).data?.find((row: any) => row.store_id === selected.store_id)
      setSelected(refreshed || null)
    }
    setWorking(false)
  }

  if (loading) {
    return <div className="adminGate"><Brand /><h1>Carregando administração...</h1><p>Validando sua permissão administrativa.</p></div>
  }

  if (!authorized) {
    return <div className="adminGate"><Brand /><ShieldCheck size={46} /><h1>Área administrativa Pedevo</h1><p>Este acesso é exclusivo para administradores cadastrados no Supabase.</p>{error && <div className="infoAlert">{error}</div>}<Link className="button" to="/entrar">Entrar com conta administrativa</Link><Link className="textLink" to="/">Voltar ao site</Link></div>
  }

  const navItems: Array<{ key: AdminSection; label: string; icon: any }> = [
    { key: 'overview', label: 'Visão geral', icon: Store },
    { key: 'stores', label: 'Lojas', icon: Building2 },
    { key: 'subscriptions', label: 'Assinantes', icon: Users },
    { key: 'finance', label: 'Financeiro', icon: DollarSign },
  ]

  const renderStoreTable = (data: any[], mode: 'overview' | 'stores' | 'subscriptions' | 'finance') => (
    <div className="tableWrap">
      <table className="dataTable adminSubscriptionTable">
        <thead>
          <tr>
            <th>Loja</th>
            {mode !== 'finance' && <th>Responsável</th>}
            {mode !== 'stores' && <th>Plano</th>}
            <th>{mode === 'finance' ? 'Adesão' : 'Próxima data'}</th>
            {mode === 'stores' && <th>Pedidos</th>}
            {mode === 'stores' && <th>Faturamento da loja</th>}
            {mode === 'finance' && <th>Mensalidade</th>}
            {mode === 'finance' && <th>Último pagamento</th>}
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.store_id}>
              <td><strong>{row.store_name}</strong><small>{businessLabel(row.business_type)}</small></td>
              {mode !== 'finance' && <td>{row.owner_name || '—'}<small>{row.owner_email || ''}</small></td>}
              {mode !== 'stores' && <td>{row.subscription_status === 'active' ? `${formatBRL(Number(row.monthly_price || 19.9))}/mês` : `Adesão ${formatBRL(Number(row.signup_fee || 29.9))}`}<small>{row.included_days || 60} dias iniciais</small></td>}
              <td>{mode === 'finance' ? (row.signup_paid_at ? `${formatBRL(Number(row.signup_fee || 29.9))}` : 'Pendente') : dateBR(nextBillingDate(row))}{mode === 'finance' && <small>{row.signup_paid_at ? dateBR(row.signup_paid_at) : 'não confirmada'}</small>}</td>
              {mode === 'stores' && <td>{row.total_orders || 0}</td>}
              {mode === 'stores' && <td>{formatBRL(Number(row.total_revenue || 0))}</td>}
              {mode === 'finance' && <td>{formatBRL(Number(row.monthly_price || 19.9))}<small>{row.subscription_status === 'active' ? `vence ${dateBR(nextBillingDate(row))}` : 'ainda sem mensalidade ativa'}</small></td>}
              {mode === 'finance' && <td>{dateBR(row.last_payment_at)}</td>}
              <td><span className={`subscriptionStatus ${statusTone(row)}`}>{statusText(row)}</span></td>
              <td><button className="miniButton" onClick={() => setSelected(row)}>Detalhes</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return <div className="adminPage">
    <aside className="adminSidebar">
      <Link to="/"><Brand compact /></Link>
      <span className="adminTag"><ShieldCheck size={14} /> Administração</span>
      <nav>
        {navItems.map((item) => {
          const Icon = item.icon
          return <button key={item.key} type="button" className={section === item.key ? 'active' : ''} onClick={() => { setSection(item.key); setQuery(''); setSuccess(''); setError('') }}><Icon /> {item.label}</button>
        })}
      </nav>
      <Link to="/painel" className="adminBack">Abrir painel de loja</Link>
    </aside>

    <main className="adminMain">
      <div className="ownerPageHeader">
        <div>
          <h1>{section === 'overview' ? 'Administração Pedevo' : section === 'stores' ? 'Lojas' : section === 'subscriptions' ? 'Assinantes' : 'Financeiro'}</h1>
          <p>{section === 'overview' ? 'Controle real de lojas, adesões e mensalidades.' : section === 'stores' ? 'Consulte todas as lojas cadastradas e abra os detalhes.' : section === 'subscriptions' ? 'Acompanhe ativações, períodos iniciais, vencimentos e bloqueios.' : 'Acompanhe a receita recorrente e os vencimentos do SaaS.'}</p>
        </div>
        <span className="adminLivePill"><CheckCircle2 size={14} /> Dados reais</span>
      </div>

      {error && <div className="infoAlert" style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div className="successAlert" style={{ marginBottom: 16 }}>{success}</div>}

      {section === 'overview' && <>
        <div className="ownerStats">
          <StatCard label="Lojas cadastradas" value={String(rows.length)} helper="Base total" icon={Building2} />
          <StatCard label="Com pedidos liberados" value={String(activeCount)} helper="Período inicial + mensal" icon={Users} />
          <StatCard label="MRR atual" value={formatBRL(mrr)} helper="Mensalistas ativos" icon={DollarSign} />
          <StatCard label="Atenção necessária" value={String(pendingCount)} helper="Pendentes, vencidos ou bloqueados" icon={AlertTriangle} />
        </div>

        <section className="panelCard">
          <div className="panelTitle"><div><h2>Lojas e assinaturas</h2><p>Confirme adesões, mensalidades e status de acesso.</p></div><label className="searchBox adminSearch"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar loja ou responsável..." /></label></div>
          {renderStoreTable(filtered, 'overview')}
          {!filtered.length && <div className="adminEmpty">Nenhuma loja encontrada.</div>}
        </section>
      </>}

      {section === 'stores' && <>
        <div className="ownerStats">
          <StatCard label="Total de lojas" value={String(rows.length)} helper="Cadastradas na plataforma" icon={Building2} />
          <StatCard label="Ativas para pedidos" value={String(activeCount)} helper="Recebendo pedidos" icon={CheckCircle2} />
          <StatCard label="Período inicial" value={String(trialCount)} helper="Dentro dos 60 dias" icon={Store} />
          <StatCard label="Com atenção" value={String(pendingCount)} helper="Pendentes ou bloqueadas" icon={AlertTriangle} />
        </div>
        <section className="panelCard">
          <div className="panelTitle"><div><h2>Todas as lojas</h2><p>Dados operacionais e acesso rápido ao cadastro de cada negócio.</p></div><label className="searchBox adminSearch"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar loja, segmento ou responsável..." /></label></div>
          {renderStoreTable(filtered, 'stores')}
          {!filtered.length && <div className="adminEmpty">Nenhuma loja encontrada.</div>}
        </section>
      </>}

      {section === 'subscriptions' && <>
        <div className="ownerStats">
          <StatCard label="Liberados" value={String(activeCount)} helper="Podem receber pedidos" icon={CheckCircle2} />
          <StatCard label="60 dias" value={String(trialCount)} helper="Período inicial ativo" icon={CreditCard} />
          <StatCard label="Mensalistas" value={String(monthlyActive.length)} helper="Plano mensal ativo" icon={Users} />
          <StatCard label="Vencidos / bloqueados" value={String(overdueCount)} helper="Precisam de ação" icon={AlertTriangle} />
        </div>
        <section className="panelCard">
          <div className="panelTitle"><div><h2>Assinaturas</h2><p>Ative adesões, renove mensalidades e controle bloqueios.</p></div><label className="searchBox adminSearch"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar assinante..." /></label></div>
          {renderStoreTable(filtered, 'subscriptions')}
          {!filtered.length && <div className="adminEmpty">Nenhum assinante encontrado.</div>}
        </section>
      </>}

      {section === 'finance' && <>
        <div className="ownerStats">
          <StatCard label="MRR atual" value={formatBRL(mrr)} helper="Receita recorrente mensal estimada" icon={DollarSign} />
          <StatCard label="Adesões confirmadas" value={formatBRL(signupRevenue)} helper="Somatório das adesões registradas" icon={CreditCard} />
          <StatCard label="Mensalistas ativos" value={String(monthlyActive.length)} helper="Assinaturas em cobrança mensal" icon={Users} />
          <StatCard label="Próximos 30 dias" value={formatBRL(next30Value)} helper={`${next30.length} vencimento(s) previsto(s)`} icon={AlertTriangle} />
        </div>
        <div className="adminFinanceNotice"><DollarSign size={18} /><div><strong>Financeiro operacional</strong><span>Os valores abaixo são calculados a partir das assinaturas registradas. Um histórico contábil completo de pagamentos será criado quando integrarmos o gateway automático.</span></div></div>
        <section className="panelCard">
          <div className="panelTitle"><div><h2>Assinaturas e cobranças</h2><p>Visão financeira das adesões e mensalidades atuais.</p></div><label className="searchBox adminSearch"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar loja..." /></label></div>
          {renderStoreTable(filtered, 'finance')}
          {!filtered.length && <div className="adminEmpty">Nenhum registro financeiro encontrado.</div>}
        </section>
      </>}
    </main>

    {selected && <div className="modalBackdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null) }}><div className="modalCard adminSubscriptionModal">
      <button className="modalClose" onClick={() => setSelected(null)}><X /></button>
      <div className="adminSubscriptionModalHead"><div><span>{businessLabel(selected.business_type)}</span><h2>{selected.store_name}</h2><p>{selected.owner_name || 'Responsável'} • {selected.owner_email}</p></div><span className={`subscriptionStatus ${statusTone(selected)}`}>{statusText(selected)}</span></div>
      <div className="adminSubSummary"><div><span>Adesão</span><strong>{formatBRL(Number(selected.signup_fee || 29.9))}</strong><small>{selected.signup_paid_at ? `paga em ${dateBR(selected.signup_paid_at)}` : 'ainda não confirmada'}</small></div><div><span>Período inicial</span><strong>{selected.included_days || 60} dias</strong><small>{selected.included_until ? `até ${dateBR(selected.included_until)}` : 'começa após ativação'}</small></div><div><span>Mensalidade</span><strong>{formatBRL(Number(selected.monthly_price || 19.9))}</strong><small>{selected.current_period_end || selected.next_charge_at ? `próxima data ${dateBR(selected.current_period_end || selected.next_charge_at)}` : 'após o período inicial'}</small></div></div>
      <div className="adminSubAccess"><CreditCard size={18} /><div><strong>{selected.can_order ? 'Pedidos liberados' : 'Pedidos pausados'}</strong><span>O bloqueio é aplicado no banco de dados, não apenas na tela.</span></div></div>
      <div className="adminSubActions">
        {selected.subscription_status === 'pending' && <button className="button" disabled={working} onClick={() => runAction('activate')}>Confirmar R$ 29,90 e liberar 60 dias</button>}
        {['trial', 'active', 'overdue', 'blocked'].includes(selected.subscription_status) && <button className="button" disabled={working} onClick={() => runAction('monthly')}>Registrar mensalidade de {formatBRL(Number(selected.monthly_price || 19.9))}</button>}
        {!['overdue', 'cancelled'].includes(selected.subscription_status) && <button className="button secondary" disabled={working} onClick={() => runAction('overdue')}>Marcar em atraso</button>}
        {selected.subscription_status !== 'blocked' && selected.subscription_status !== 'cancelled' && <button className="button secondary dangerOutline" disabled={working} onClick={() => runAction('blocked')}>Bloquear pedidos</button>}
        {selected.subscription_status !== 'cancelled' && <button className="textDangerButton" disabled={working} onClick={() => { if (confirm('Cancelar esta assinatura? Os dados da loja serão mantidos.')) runAction('cancelled') }}>Cancelar assinatura</button>}
      </div>
      <div className="adminSubFooter"><Link to={`/loja/${selected.slug}`} target="_blank">Abrir loja pública <ExternalLink size={14} /></Link><span>Criada em {dateBR(selected.store_created_at)}</span></div>
    </div></div>}
  </div>
}
