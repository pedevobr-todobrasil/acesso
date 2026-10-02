import {
  AlertTriangle,
  Archive,
  BadgePercent,
  Building2,
  CalendarRange,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Pencil,
  Plus,
  LogOut,
  Search,
  ShieldCheck,
  Store,
  Users,
  X,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Brand from '../components/Brand'
import SecuritySettings from '../components/SecuritySettings'
import StatCard from '../components/StatCard'
import { formatBRL } from '../lib/format'
import { slugify } from '../lib/pedevoApi'
import { supabase } from '../lib/supabase'

type AdminSection = 'overview' | 'stores' | 'subscriptions' | 'finance' | 'plans' | 'security'

function dateBR(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('pt-BR')
}

function dateInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function daysLeft(value?: string | null) {
  if (!value) return 0
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000))
}

function statusText(row: any) {
  const status = row.subscription_status
  const plan = row.plan_name || 'Plano Pedevo'
  if (status === 'pending') return 'Adesão pendente'
  if (status === 'trial') return row.can_order ? `${plan} • ${daysLeft(row.included_until)}d` : 'Período encerrado'
  if (status === 'active') return row.can_order ? `${plan} ativo` : 'Renovação vencida'
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
  const labels: Record<string, string> = { deposito_bebidas:'Depósito de bebidas', hamburgueria:'Hamburgueria', pizzaria:'Pizzaria', pastelaria:'Pastelaria', doceria:'Doceria', acai:'Açaí', marmitaria:'Marmitaria', restaurante:'Restaurante', conveniencia:'Conveniência', outro:'Outro' }
  return labels[value] || value
}

function nextBillingDate(row: any) {
  return row.subscription_status === 'trial' ? row.included_until : row.current_period_end || row.next_charge_at
}

function cycleLabel(months: number) {
  return months === 1 ? '1 mês' : `${months} meses`
}

function isPlanAvailable(plan: any) {
  const now = Date.now()
  if (!plan.active) return false
  if (plan.starts_at && new Date(plan.starts_at).getTime() > now) return false
  if (plan.ends_at && new Date(plan.ends_at).getTime() < now) return false
  return true
}

export default function SaaSAdmin() {
  const [section, setSection] = useState<AdminSection>('overview')
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selected, setSelected] = useState<any | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [working, setWorking] = useState(false)
  const [planModal, setPlanModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<any | null>(null)

  async function load() {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    setError('')
    const session = await supabase.auth.getSession()
    if (!session.data.session) { setAuthorized(false); setLoading(false); return }
    const adminResult = await supabase.rpc('is_pedevo_admin')
    if (adminResult.error || !adminResult.data) { setError(adminResult.error?.message || 'Conta sem permissão administrativa.'); setAuthorized(false); setLoading(false); return }
    setAuthorized(true)
    const [overview, planResult] = await Promise.all([
      supabase.rpc('admin_subscription_overview'),
      supabase.rpc('admin_list_saas_plans'),
    ])
    if (overview.error) setError(overview.error.message)
    else setRows(overview.data || [])
    if (planResult.error) setError((current)=> current || planResult.error!.message)
    else setPlans(planResult.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut({ scope: 'local' })
    window.location.hash = '#/admin/entrar'
  }

  const filtered = useMemo(() => rows.filter((row) => `${row.store_name} ${row.business_type} ${row.owner_name} ${row.owner_email} ${row.plan_name || ''}`.toLowerCase().includes(query.toLowerCase())), [rows, query])
  const activeCount = rows.filter((row) => (row.subscription_status === 'trial' || row.subscription_status === 'active') && row.can_order).length
  const recurringActive = rows.filter((row) => row.subscription_status === 'active' && row.can_order)
  const mrr = recurringActive.reduce((sum, row) => sum + Number(row.monthly_price || 0) / Math.max(1, Number(row.renewal_months || 1)), 0)
  const pendingCount = rows.filter((row) => !row.can_order || ['pending','overdue','blocked'].includes(row.subscription_status)).length
  const signupRevenue = rows.filter((row) => row.signup_paid_at).reduce((sum, row) => sum + Number(row.signup_fee || 0), 0)
  const next30 = rows.filter((row) => { const raw = nextBillingDate(row); if (!raw || !row.can_order) return false; const diff = new Date(raw).getTime() - Date.now(); return diff >= 0 && diff <= 30*86400000 })
  const next30Value = next30.reduce((sum, row) => sum + Number(row.monthly_price || 0), 0)
  const initialCount = rows.filter((row) => row.subscription_status === 'trial' && row.can_order).length
  const overdueCount = rows.filter((row) => ['overdue','blocked'].includes(row.subscription_status) || ((row.subscription_status === 'trial' || row.subscription_status === 'active') && !row.can_order)).length
  const availablePlans = plans.filter(isPlanAvailable)

  async function runAction(action: 'activate' | 'renew' | 'overdue' | 'blocked' | 'cancelled') {
    if (!supabase || !selected) return
    setWorking(true); setError(''); setSuccess('')
    let result: any
    if (action === 'activate') result = await supabase.rpc('admin_activate_subscription', { p_store_id: selected.store_id, p_plan_id: selectedPlanId || selected.plan_id || null })
    else if (action === 'renew') result = await supabase.rpc('admin_register_monthly_payment', { p_store_id: selected.store_id })
    else result = await supabase.rpc('admin_set_subscription_status', { p_store_id: selected.store_id, p_status: action })
    if (result.error) setError(result.error.message)
    else {
      setSuccess(action === 'activate' ? 'Adesão confirmada e plano liberado.' : action === 'renew' ? 'Renovação registrada e acesso atualizado.' : `Status atualizado para ${action}.`)
      await refreshSelected()
    }
    setWorking(false)
  }

  async function refreshSelected() {
    if (!supabase || !selected) { await load(); return }
    const [overview, planResult] = await Promise.all([supabase.rpc('admin_subscription_overview'), supabase.rpc('admin_list_saas_plans')])
    if (!overview.error) {
      const data = overview.data || []
      setRows(data)
      const fresh = data.find((row:any)=>row.store_id===selected.store_id)
      setSelected(fresh || null)
      if (fresh?.plan_id) setSelectedPlanId(fresh.plan_id)
    }
    if (!planResult.error) setPlans(planResult.data || [])
  }

  async function applyPlan() {
    if (!supabase || !selected || !selectedPlanId) return
    setWorking(true); setError(''); setSuccess('')
    const result = await supabase.rpc('admin_assign_subscription_plan', { p_store_id: selected.store_id, p_plan_id: selectedPlanId })
    if (result.error) setError(result.error.message)
    else { setSuccess('Plano atualizado para as próximas regras de cobrança.'); await refreshSelected() }
    setWorking(false)
  }

  function openPlan(plan?: any) { setEditingPlan(plan || null); setPlanModal(true); setError(''); setSuccess('') }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || '').trim()
    const code = slugify(String(form.get('code') || name))
    const starts = String(form.get('starts_at') || '')
    const ends = String(form.get('ends_at') || '')
    setWorking(true); setError(''); setSuccess('')
    const result = await supabase.rpc('admin_save_saas_plan', {
      p_id: editingPlan?.id || null,
      p_name: name,
      p_code: code,
      p_description: String(form.get('description') || '').trim() || null,
      p_badge: String(form.get('badge') || '').trim() || null,
      p_activation_price: Number(form.get('activation_price') || 0),
      p_included_days: Number(form.get('included_days') || 0),
      p_renewal_price: Number(form.get('renewal_price') || 0),
      p_renewal_months: Number(form.get('renewal_months') || 1),
      p_is_default: form.get('is_default') === 'on',
      p_active: form.get('active') === 'on',
      p_starts_at: starts ? new Date(starts).toISOString() : null,
      p_ends_at: ends ? new Date(ends).toISOString() : null,
      p_sort_order: Number(form.get('sort_order') || 0),
    })
    if (result.error) setError(result.error.message)
    else { setSuccess(editingPlan ? 'Plano atualizado.' : 'Novo plano criado.'); setPlanModal(false); setEditingPlan(null); await load() }
    setWorking(false)
  }

  async function archivePlan(plan: any) {
    if (!supabase || !confirm(`Arquivar “${plan.name}”? Ele deixará de aparecer para novas adesões.`)) return
    setWorking(true); setError(''); setSuccess('')
    const result = await supabase.rpc('admin_archive_saas_plan', { p_plan_id: plan.id })
    if (result.error) setError(result.error.message)
    else { setSuccess('Plano arquivado. Assinaturas existentes foram preservadas.'); await load() }
    setWorking(false)
  }

  if (loading) return <div className="adminGate"><Brand/><h1>Carregando administração...</h1><p>Validando sua permissão administrativa.</p></div>
  if (!authorized) return <div className="adminGate"><Brand/><ShieldCheck size={46}/><h1>Área administrativa Pedevo</h1><p>Este acesso é exclusivo para administradores cadastrados no Supabase.</p>{error && <div className="infoAlert">{error}</div>}<Link className="button" to="/admin/entrar">Entrar com conta administrativa</Link><Link className="textLink" to="/">Voltar ao site</Link></div>

  const navItems: Array<{key:AdminSection;label:string;icon:any}> = [
    {key:'overview',label:'Visão geral',icon:Store}, {key:'stores',label:'Lojas',icon:Building2}, {key:'subscriptions',label:'Assinantes',icon:Users}, {key:'finance',label:'Financeiro',icon:DollarSign}, {key:'plans',label:'Planos e promoções',icon:BadgePercent}, {key:'security',label:'Segurança',icon:ShieldCheck},
  ]

  const renderStoreTable = (data:any[], mode:'overview'|'stores'|'subscriptions'|'finance') => <div className="tableWrap"><table className="dataTable adminSubscriptionTable"><thead><tr><th>Loja</th>{mode!=='finance'&&<th>Responsável</th>}{mode!=='stores'&&<th>Plano</th>}<th>{mode==='finance'?'Adesão':'Próxima data'}</th>{mode==='stores'&&<><th>Pedidos</th><th>Faturamento da loja</th></>}{mode==='finance'&&<><th>Renovação</th><th>Último pagamento</th></>}<th>Status</th><th></th></tr></thead><tbody>{data.map((row)=><tr key={row.store_id}><td><strong>{row.store_name}</strong><small>{businessLabel(row.business_type)}</small></td>{mode!=='finance'&&<td>{row.owner_name||'—'}<small>{row.owner_email||''}</small></td>}{mode!=='stores'&&<td>{row.plan_name||'Plano Pedevo'}<small>{formatBRL(Number(row.monthly_price||0))} / {cycleLabel(Number(row.renewal_months||1))}</small></td>}<td>{mode==='finance'?(row.signup_paid_at?formatBRL(Number(row.signup_fee||0)):'Pendente'):dateBR(nextBillingDate(row))}{mode==='finance'&&<small>{row.signup_paid_at?dateBR(row.signup_paid_at):'não confirmada'}</small>}</td>{mode==='stores'&&<><td>{row.total_orders||0}</td><td>{formatBRL(Number(row.total_revenue||0))}</td></>}{mode==='finance'&&<><td>{formatBRL(Number(row.monthly_price||0))}<small>{cycleLabel(Number(row.renewal_months||1))}</small></td><td>{dateBR(row.last_payment_at)}</td></>}<td><span className={`subscriptionStatus ${statusTone(row)}`}>{statusText(row)}</span></td><td><button className="miniButton" onClick={()=>{setSelected(row);setSelectedPlanId(row.plan_id||'')}}>Detalhes</button></td></tr>)}</tbody></table></div>

  return <div className="adminPage"><aside className="adminSidebar"><Link to="/"><Brand compact/></Link><span className="adminTag"><ShieldCheck size={14}/> Administração</span><nav>{navItems.map((item)=>{const Icon=item.icon;return <button key={item.key} type="button" className={section===item.key?'active':''} onClick={()=>{setSection(item.key);setQuery('');setSuccess('');setError('')}}><Icon/> {item.label}</button>})}</nav><div className="adminPrivacyNote"><ShieldCheck size={15}/><span>O Painel Master gerencia contas, planos e cobrança. Ele não abre o painel operacional dos lojistas.</span></div><button type="button" className="adminLogoutButton" onClick={handleSignOut}><LogOut size={17}/> Sair</button></aside>

    <main className="adminMain"><div className="ownerPageHeader"><div><h1>{section==='overview'?'Administração Pedevo':section==='stores'?'Lojas':section==='subscriptions'?'Assinantes':section==='finance'?'Financeiro':section==='plans'?'Planos e promoções':'Segurança administrativa'}</h1><p>{section==='overview'?'Controle real de lojas, adesões e planos.':section==='stores'?'Consulte as lojas cadastradas sem acessar a operação interna delas.':section==='subscriptions'?'Acompanhe ativações, vencimentos e bloqueios.':section==='finance'?'Acompanhe receitas e próximos vencimentos.':section==='plans'?'Crie preços, promoções e pacotes sem alterar o código do Pedevo.':'Proteja sua própria conta administrativa com verificação opcional.'}</p></div><span className="adminLivePill"><CheckCircle2 size={14}/> Dados reais</span></div>
      {error&&<div className="infoAlert" style={{marginBottom:16}}>{error}</div>}{success&&<div className="successAlert" style={{marginBottom:16}}>{success}</div>}

      {section==='overview'&&<><div className="ownerStats"><StatCard label="Lojas cadastradas" value={String(rows.length)} helper="Base total" icon={Building2}/><StatCard label="Com pedidos liberados" value={String(activeCount)} helper="Acesso válido" icon={Users}/><StatCard label="MRR equivalente" value={formatBRL(mrr)} helper="Planos normalizados por mês" icon={DollarSign}/><StatCard label="Atenção necessária" value={String(pendingCount)} helper="Pendentes, vencidos ou bloqueados" icon={AlertTriangle}/></div><section className="panelCard"><div className="panelTitle"><div><h2>Lojas e assinaturas</h2><p>Confirme adesões, renovações e status de acesso.</p></div><label className="searchBox adminSearch"><Search/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar loja ou responsável..."/></label></div>{renderStoreTable(filtered,'overview')}</section></>}

      {section==='stores'&&<><div className="ownerStats"><StatCard label="Total de lojas" value={String(rows.length)} helper="Cadastradas" icon={Building2}/><StatCard label="Ativas para pedidos" value={String(activeCount)} helper="Recebendo pedidos" icon={CheckCircle2}/><StatCard label="Acesso inicial" value={String(initialCount)} helper="Período contratado em andamento" icon={Store}/><StatCard label="Com atenção" value={String(pendingCount)} helper="Pendentes ou bloqueadas" icon={AlertTriangle}/></div><section className="panelCard"><div className="panelTitle"><div><h2>Todas as lojas</h2><p>Dados administrativos. O master não entra no painel interno do lojista.</p></div><label className="searchBox adminSearch"><Search/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar loja, segmento ou responsável..."/></label></div>{renderStoreTable(filtered,'stores')}</section></>}

      {section==='subscriptions'&&<><div className="ownerStats"><StatCard label="Liberados" value={String(activeCount)} helper="Podem receber pedidos" icon={CheckCircle2}/><StatCard label="Acesso inicial" value={String(initialCount)} helper="Período após adesão" icon={CreditCard}/><StatCard label="Renovações ativas" value={String(recurringActive.length)} helper="Ciclos contratados" icon={Users}/><StatCard label="Vencidos / bloqueados" value={String(overdueCount)} helper="Precisam de ação" icon={AlertTriangle}/></div><section className="panelCard"><div className="panelTitle"><div><h2>Assinaturas</h2><p>Escolha o plano de cada adesão e controle as renovações.</p></div><label className="searchBox adminSearch"><Search/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar assinante..."/></label></div>{renderStoreTable(filtered,'subscriptions')}</section></>}

      {section==='finance'&&<><div className="ownerStats"><StatCard label="MRR equivalente" value={formatBRL(mrr)} helper="Receita recorrente normalizada" icon={DollarSign}/><StatCard label="Adesões confirmadas" value={formatBRL(signupRevenue)} helper="Somatório registrado" icon={CreditCard}/><StatCard label="Assinaturas ativas" value={String(recurringActive.length)} helper="Ciclos em andamento" icon={Users}/><StatCard label="Próximos 30 dias" value={formatBRL(next30Value)} helper={`${next30.length} vencimento(s)`} icon={AlertTriangle}/></div><div className="adminFinanceNotice"><DollarSign size={18}/><div><strong>Financeiro operacional</strong><span>Pacotes de vários meses são convertidos para um MRR equivalente apenas para análise. O valor cobrado no vencimento continua sendo o valor integral do ciclo.</span></div></div><section className="panelCard"><div className="panelTitle"><div><h2>Assinaturas e cobranças</h2><p>Visão financeira das adesões e renovações.</p></div><label className="searchBox adminSearch"><Search/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar loja..."/></label></div>{renderStoreTable(filtered,'finance')}</section></>}

      {section==='plans'&&<><div className="ownerStats"><StatCard label="Planos cadastrados" value={String(plans.length)} helper="Ativos e arquivados" icon={BadgePercent}/><StatCard label="Disponíveis agora" value={String(availablePlans.length)} helper="Visíveis para novas adesões" icon={CheckCircle2}/><StatCard label="Promoções agendadas" value={String(plans.filter((p)=>p.active&&(p.starts_at||p.ends_at)).length)} helper="Com período definido" icon={CalendarRange}/><StatCard label="Plano padrão" value={plans.find((p)=>p.is_default)?.name||'Nenhum'} helper="Usado quando não há escolha" icon={Store}/></div><section className="panelCard commercialPlansPanel"><div className="panelTitle"><div><h2>Planos, pacotes e promoções</h2><p>Você pode mudar a adesão, remover os 60 dias, criar 90 dias promocionais ou vender ciclos de 2, 3 e 12 meses.</p></div><button className="button" onClick={()=>openPlan()}><Plus size={17}/> Novo plano</button></div><div className="commercialRuleBox"><BadgePercent/><div><strong>Como funciona</strong><span>O “valor inicial” é cobrado na adesão. Os “dias de acesso inicial” começam após a confirmação. Depois, a renovação usa o valor e o ciclo configurados. Ex.: R$ 59,90 + 90 dias + R$ 19,90/mês; ou pacote R$ 149,90 + 365 dias + renovação anual.</span></div></div><div className="commercialPlanList">{plans.map((plan)=><article key={plan.id} className={`commercialPlanCard ${plan.active?'':'archived'}`}><div className="commercialPlanTop"><div><span className="planBadge">{plan.badge||'PEDEVO'}</span><h3>{plan.name}</h3><p>{plan.description||'Sem descrição.'}</p></div><div className="commercialPlanFlags">{plan.is_default&&<span className="defaultPlanPill">Padrão</span>}<span className={isPlanAvailable(plan)?'activePill':'inactivePill'}>{isPlanAvailable(plan)?'Disponível':'Fora de vigência'}</span></div></div><div className="commercialPlanNumbers"><div><span>Valor inicial</span><strong>{formatBRL(Number(plan.activation_price||0))}</strong></div><div><span>Acesso inicial</span><strong>{plan.included_days||0} dias</strong></div><div><span>Renovação</span><strong>{formatBRL(Number(plan.renewal_price||0))}</strong><small>a cada {cycleLabel(Number(plan.renewal_months||1))}</small></div><div><span>Vigência</span><strong>{plan.starts_at?dateBR(plan.starts_at):'Agora'}</strong><small>{plan.ends_at?`até ${dateBR(plan.ends_at)}`:'sem data final'}</small></div></div><div className="commercialPlanActions"><button className="miniButton" onClick={()=>openPlan(plan)}><Pencil size={14}/> Editar</button>{plan.active&&<button className="miniButton dangerMiniButton" disabled={working||plan.is_default} onClick={()=>archivePlan(plan)} title={plan.is_default?'Escolha outro plano padrão antes de arquivar.':''}><Archive size={14}/> Arquivar</button>}</div></article>)}</div></section></>}

      {section==='security'&&<SecuritySettings logoutPath="/admin/entrar"/>}
    </main>

    {selected&&<div className="modalBackdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setSelected(null)}}><div className="modalCard adminSubscriptionModal"><button className="modalClose" onClick={()=>setSelected(null)}><X/></button><div className="adminSubscriptionModalHead"><div><span>{businessLabel(selected.business_type)}</span><h2>{selected.store_name}</h2><p>{selected.owner_name||'Responsável'} • {selected.owner_email}</p></div><span className={`subscriptionStatus ${statusTone(selected)}`}>{statusText(selected)}</span></div><div className="adminSubSummary"><div><span>Pagamento inicial</span><strong>{formatBRL(Number(selected.signup_fee||0))}</strong><small>{selected.signup_paid_at?`pago em ${dateBR(selected.signup_paid_at)}`:'ainda não confirmado'}</small></div><div><span>Acesso inicial</span><strong>{selected.included_days||0} dias</strong><small>{selected.included_until?`até ${dateBR(selected.included_until)}`:'começa após ativação'}</small></div><div><span>Renovação</span><strong>{formatBRL(Number(selected.monthly_price||0))}</strong><small>a cada {cycleLabel(Number(selected.renewal_months||1))}</small></div></div><div className="adminPlanAssignment"><label>Plano desta loja<select value={selectedPlanId} onChange={(e)=>setSelectedPlanId(e.target.value)}>{plans.filter((p)=>p.active||p.id===selected.plan_id).map((plan)=><option key={plan.id} value={plan.id}>{plan.name} — {formatBRL(Number(plan.activation_price||0))} / {plan.included_days}d / {formatBRL(Number(plan.renewal_price||0))} a cada {plan.renewal_months}m</option>)}</select></label>{selected.subscription_status!=='pending'&&<button className="button secondary" disabled={working||!selectedPlanId||selectedPlanId===selected.plan_id} onClick={applyPlan}>Aplicar para próximas renovações</button>}</div><div className="adminSubAccess"><CreditCard size={18}/><div><strong>{selected.can_order?'Pedidos liberados':'Pedidos pausados'}</strong><span>A administração controla somente assinatura e acesso. O conteúdo operacional da loja permanece no painel do próprio lojista.</span></div></div><div className="adminSubActions">{selected.subscription_status==='pending'&&<button className="button" disabled={working||!selectedPlanId} onClick={()=>runAction('activate')}>Confirmar adesão e ativar plano</button>}{['trial','active','overdue','blocked'].includes(selected.subscription_status)&&<button className="button" disabled={working} onClick={()=>runAction('renew')}>Registrar renovação de {formatBRL(Number(selected.monthly_price||0))}</button>}{!['overdue','cancelled'].includes(selected.subscription_status)&&<button className="button secondary" disabled={working} onClick={()=>runAction('overdue')}>Marcar em atraso</button>}{selected.subscription_status!=='blocked'&&selected.subscription_status!=='cancelled'&&<button className="button secondary dangerOutline" disabled={working} onClick={()=>runAction('blocked')}>Bloquear pedidos</button>}{selected.subscription_status!=='cancelled'&&<button className="textDangerButton" disabled={working} onClick={()=>{if(confirm('Cancelar esta assinatura? Os dados da loja serão mantidos.'))runAction('cancelled')}}>Cancelar assinatura</button>}</div><div className="adminSubFooter"><span>Loja pública: /loja/{selected.slug}</span><span>Criada em {dateBR(selected.store_created_at)}</span></div></div></div>}

    {planModal&&<div className="modalBackdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setPlanModal(false)}}><div className="modalCard commercialPlanModal"><button className="modalClose" onClick={()=>setPlanModal(false)}><X/></button><div className="modalTitle"><div><h2>{editingPlan?'Editar plano ou promoção':'Novo plano, pacote ou promoção'}</h2><p>As alterações valem para novas adesões e para assinaturas às quais você aplicar este plano.</p></div></div><form onSubmit={savePlan}><div className="formGrid two"><label>Nome<input name="name" required defaultValue={editingPlan?.name||''} placeholder="Ex.: Promo Dia do Trabalho"/></label><label>Código<input name="code" defaultValue={editingPlan?.code||''} placeholder="Gerado pelo nome se vazio"/></label></div><label>Descrição<textarea name="description" rows={3} defaultValue={editingPlan?.description||''} placeholder="Explique a condição para o lojista."/></label><div className="formGrid two"><label>Valor inicial / adesão<input name="activation_price" type="number" step="0.01" min="0" required defaultValue={editingPlan?.activation_price??29.9}/></label><label>Dias de acesso após adesão<input name="included_days" type="number" min="0" max="730" required defaultValue={editingPlan?.included_days??60}/></label><label>Valor da renovação<input name="renewal_price" type="number" step="0.01" min="0" required defaultValue={editingPlan?.renewal_price??19.9}/></label><label>Renovar a cada<input name="renewal_months" type="number" min="1" max="24" required defaultValue={editingPlan?.renewal_months??1}/><small>meses — use 2, 3, 6, 12 etc.</small></label></div><div className="formGrid two"><label>Etiqueta / chamada<input name="badge" defaultValue={editingPlan?.badge||''} placeholder="Ex.: DIA DO TRABALHO"/></label><label>Ordem<input name="sort_order" type="number" defaultValue={editingPlan?.sort_order??plans.length}/></label><label>Começa em<input name="starts_at" type="datetime-local" defaultValue={dateInput(editingPlan?.starts_at)}/></label><label>Termina em<input name="ends_at" type="datetime-local" defaultValue={dateInput(editingPlan?.ends_at)}/></label></div><div className="commercialChecks"><label className="checkLine"><input name="active" type="checkbox" defaultChecked={editingPlan?Boolean(editingPlan.active):true}/> Disponível para novas adesões</label><label className="checkLine"><input name="is_default" type="checkbox" defaultChecked={Boolean(editingPlan?.is_default)}/> Tornar plano padrão</label></div><div className="commercialExamples"><strong>Exemplos:</strong><span>Promoção 90 dias: valor inicial R$ 59,90 + 90 dias + renovação mensal.</span><span>Pacote trimestral: valor inicial do pacote + 90 dias + renovação a cada 3 meses.</span><span>Plano anual: valor inicial + 365 dias + renovação a cada 12 meses.</span></div><button className="button large full" disabled={working}>{working?'Salvando...':'Salvar plano'}</button></form></div></div>}
  </div>
}
