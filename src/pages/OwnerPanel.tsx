import { AlertTriangle, BarChart3, BellRing, Bike, Box, CalendarDays, CheckCircle2, Clock3, Copy, CreditCard, DollarSign, Eye, MapPin, MessageCircle, Package, Pencil, Plus, Search, Settings, ShieldCheck, ShoppingBag, Store, Tags, Trash2, Users, Volume2, VolumeX, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import OwnerShell from '../components/OwnerShell'
import SecuritySettings from '../components/SecuritySettings'
import StatCard from '../components/StatCard'
import { formatBRL, statusLabel } from '../lib/format'
import { createProduct, getOwnedStore, markManualPixPaid, saveMercadoPagoToken, sendOrderWhatsapp, uploadProductImage } from '../lib/pedevoApi'
import { supabase } from '../lib/supabase'
import type { OpeningHours, Product } from '../types'

function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="ownerPageHeader"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function dateBR(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('pt-BR')
}

function daysRemaining(value?: string | null) {
  if (!value) return 0
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000))
}

function playNewOrderSound() {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const notes = [880, 1174, 1568]
    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + index * 0.16)
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + index * 0.16 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + index * 0.16 + 0.13)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(ctx.currentTime + index * 0.16)
      oscillator.stop(ctx.currentTime + index * 0.16 + 0.14)
    })
    window.setTimeout(() => { try { void ctx.close() } catch {} }, 800)
  } catch {
    // Alguns navegadores bloqueiam áudio até a primeira interação do usuário.
  }
}

function subscriptionMeta(subscription: any) {
  if (!subscription) return { label: 'Não encontrada', tone: 'blocked', detail: 'Fale com o suporte Pedevo.', canOrder: false }
  const planName = subscription.plan_name || 'Plano Pedevo'
  const cycleMonths = Number(subscription.renewal_months || 1)
  const cycleLabel = cycleMonths === 1 ? 'mês' : `${cycleMonths} meses`
  if (subscription.status === 'pending') return { label: 'Aguardando ativação', tone: 'pending', detail: `${planName} • pagamento inicial de ${formatBRL(Number(subscription.signup_fee || 0))} pendente.`, canOrder: false }
  if (subscription.status === 'trial') {
    const days = daysRemaining(subscription.included_until)
    const valid = days > 0
    return { label: valid ? planName : 'Período encerrado', tone: valid ? 'trial' : 'overdue', detail: valid ? `${days} dia(s) restante(s) • até ${dateBR(subscription.included_until)}` : `O período de acesso do ${planName} foi encerrado.`, canOrder: valid }
  }
  if (subscription.status === 'active') {
    const due = subscription.current_period_end || subscription.next_charge_at
    const valid = !due || new Date(due).getTime() >= Date.now()
    return { label: valid ? `${planName} ativo` : 'Renovação vencida', tone: valid ? 'active' : 'overdue', detail: due ? `Próxima renovação: ${dateBR(due)} • ${formatBRL(Number(subscription.monthly_price || 0))} / ${cycleLabel}` : `Renovação ${formatBRL(Number(subscription.monthly_price || 0))} / ${cycleLabel}`, canOrder: valid }
  }
  if (subscription.status === 'overdue') return { label: 'Pagamento pendente', tone: 'overdue', detail: `Renovação de ${formatBRL(Number(subscription.monthly_price || 0))} pendente.`, canOrder: false }
  if (subscription.status === 'blocked') return { label: 'Assinatura bloqueada', tone: 'blocked', detail: 'Novos pedidos estão pausados até a regularização.', canOrder: false }
  return { label: 'Assinatura cancelada', tone: 'blocked', detail: 'A loja não está recebendo novos pedidos.', canOrder: false }
}

export default function OwnerPanel() {
  const path = useLocation().pathname
  return <OwnerShell>
    {path === '/painel' && <DashboardHome />}
    {path === '/painel/pedidos' && <Orders />}
    {path === '/painel/produtos' && <Products />}
    {path === '/painel/categorias' && <Categories />}
    {path === '/painel/entregas' && <Delivery />}
    {path === '/painel/pagamentos' && <Payments />}
    {path === '/painel/relatorios' && <Reports />}
    {path === '/painel/minha-loja' && <MyStore />}
    {path === '/painel/configuracoes' && <SettingsPage />}
  </OwnerShell>
}

function operationalStart(store: any) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (!store?.last_cash_closed_at) return today
  const lastClose = new Date(store.last_cash_closed_at)
  return lastClose.getTime() > today.getTime() ? lastClose : today
}

function PaginationControls({ page, pageSize, total, onPage, onPageSize }: { page: number; pageSize: number; total: number; onPage: (page: number) => void; onPageSize: (size: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const end = Math.min(total, safePage * pageSize)
  return <div className="orderPagination">
    <div className="pageSizeSelector"><span>Pedidos por página</span><select value={pageSize} onChange={(e)=>onPageSize(Number(e.target.value))}><option value={10}>10</option><option value={30}>30</option><option value={50}>50</option></select></div>
    <div className="pageCounter"><span>{total ? `${start}–${end} de ${total}` : '0 pedidos'}</span><button type="button" className="miniButton" disabled={safePage <= 1} onClick={()=>onPage(safePage - 1)}>← Anterior</button><strong>{safePage} / {totalPages}</strong><button type="button" className="miniButton" disabled={safePage >= totalPages} onClick={()=>onPage(safePage + 1)}>Próxima →</button></div>
  </div>
}

function DashboardHome() {
  const [loading, setLoading] = useState(true)
  const [store, setStore] = useState<any>(null)
  const [stats, setStats] = useState({ ordersToday: 0, salesToday: 0, customers: 0, products: 0 })
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [weekSales, setWeekSales] = useState<number[]>([0, 0, 0, 0, 0, 0, 0])
  const [subscription, setSubscription] = useState<any>(null)
  const [newOrderAlert, setNewOrderAlert] = useState<any>(null)
  const [highlightedOrderIds, setHighlightedOrderIds] = useState<string[]>([])
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [closingCash, setClosingCash] = useState(false)
  const [cashMessage, setCashMessage] = useState('')
  const [cashError, setCashError] = useState('')

  async function loadDashboard() {
    if (!supabase) { setLoading(false); return }
    const { data: ownedStore } = await getOwnedStore()
    if (!ownedStore) { setLoading(false); return }
    setStore(ownedStore)

    // Limpeza de retenção também é executada ao abrir o painel. O Cron do Supabase faz isso em segundo plano quando habilitado.
    try { await supabase.rpc('cleanup_my_expired_orders') } catch {}

    const activeStart = operationalStart(ownedStore)
    const startWeek = new Date(); startWeek.setDate(startWeek.getDate() - 6); startWeek.setHours(0,0,0,0)
    const [todayResult, customerResult, productResult, recentResult, weekResult, subscriptionResult] = await Promise.all([
      supabase.from('orders').select('id,total,status,created_at').eq('store_id', ownedStore.id).gte('created_at', activeStart.toISOString()),
      supabase.from('customers').select('id', { count:'exact', head:true }).eq('store_id', ownedStore.id),
      supabase.from('products').select('id', { count:'exact', head:true }).eq('store_id', ownedStore.id).eq('active', true),
      supabase.from('orders').select('id,order_number,order_type,total,status,created_at,customer:customers(name)').eq('store_id', ownedStore.id).gte('created_at', activeStart.toISOString()).order('created_at',{ascending:false}),
      supabase.from('orders').select('total,status,created_at').eq('store_id', ownedStore.id).gte('created_at', startWeek.toISOString()),
      supabase.from('subscriptions').select('*').eq('store_id', ownedStore.id).maybeSingle(),
    ])
    const currentOrders = todayResult.data || []
    const salesToday = currentOrders.filter((order:any)=>order.status !== 'cancelled').reduce((sum:number,order:any)=>sum+Number(order.total||0),0)
    setStats({ ordersToday:currentOrders.length, salesToday, customers:customerResult.count||0, products:productResult.count||0 })
    setRecentOrders(recentResult.data || [])
    setSubscription(subscriptionResult.data || null)
    const buckets = Array.from({length:7},(_,index)=>{ const date=new Date(startWeek); date.setDate(startWeek.getDate()+index); return {key:date.toLocaleDateString('pt-BR'),total:0} })
    for (const order of weekResult.data || []) { if (order.status==='cancelled') continue; const key=new Date(order.created_at).toLocaleDateString('pt-BR'); const bucket=buckets.find((item)=>item.key===key); if(bucket) bucket.total += Number(order.total||0) }
    setWeekSales(buckets.map((item)=>item.total))
    setPage(1)
    setLoading(false)
  }

  useEffect(() => { let mounted=true; void loadDashboard(); return ()=>{mounted=false; void mounted} }, [])

  useEffect(() => {
    if (!supabase || !store?.id) return
    const client = supabase
    const channel = client.channel(`owner-new-orders-${store.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'orders',filter:`store_id=eq.${store.id}`},async(payload:any)=>{
      const inserted=payload.new||{}
      const {data}=await client.from('orders').select('id,order_number,order_type,total,status,created_at,customer:customers(name)').eq('id',inserted.id).maybeSingle()
      const order=data||inserted
      const orderId=String(order.id||inserted.id||'')
      const orderNumber=order.order_number||String(orderId).slice(0,6)
      const customer=Array.isArray(order.customer)?order.customer[0]?.name:order.customer?.name
      setRecentOrders((current)=>[order,...current.filter((item)=>item.id!==order.id)])
      setStats((current)=>({...current,ordersToday:current.ordersToday+1,salesToday:current.salesToday+Number(order.total||0)}))
      setNewOrderAlert({id:orderId,number:orderNumber,customer:customer||'Cliente',total:Number(order.total||0)})
      setPage(1)
      if(store.new_order_sound_enabled!==false) playNewOrderSound()
      if(store.new_order_flash_enabled!==false&&orderId) setHighlightedOrderIds((current)=>Array.from(new Set([orderId,...current])))
      window.setTimeout(()=>{setNewOrderAlert((current:any)=>current?.id===orderId?null:current);setHighlightedOrderIds((current)=>current.filter((id)=>id!==orderId))},30000)
    }).subscribe()
    return ()=>{void client.removeChannel(channel)}
  },[store?.id,store?.new_order_sound_enabled,store?.new_order_flash_enabled])

  async function closeCashRegister() {
    if (!supabase || !store?.id || closingCash) return
    const activeStart = operationalStart(store)
    const validOrders = recentOrders.filter((order:any)=>order.status !== 'cancelled')
    const total = validOrders.reduce((sum:number,order:any)=>sum+Number(order.total||0),0)
    const confirmation = `Fechar o caixa agora?\\n\\n${recentOrders.length} pedido(s) no caixa atual\\nFaturamento: ${formatBRL(total)}\\n\\nDepois do fechamento, esses pedidos sairão da operação e ficarão disponíveis em Relatórios até o prazo de retenção.`
    if (!window.confirm(confirmation)) return
    setClosingCash(true); setCashError(''); setCashMessage('')
    const result = await supabase.rpc('close_cash_register',{p_store_id:store.id,p_opened_at:activeStart.toISOString()})
    if (result.error) setCashError(result.error.message)
    else {
      const closedAt = result.data?.closed_at || new Date().toISOString()
      setStore((current:any)=>({...current,last_cash_closed_at:closedAt}))
      setRecentOrders([]); setStats((current)=>({...current,ordersToday:0,salesToday:0})); setPage(1); setNewOrderAlert(null); setHighlightedOrderIds([])
      setCashMessage(`Caixa fechado. ${result.data?.orders_count ?? recentOrders.length} pedido(s) foram enviados para Relatórios.`)
    }
    setClosingCash(false)
  }

  const averageTicket=stats.ordersToday?stats.salesToday/stats.ordersToday:0
  const maxWeek=Math.max(...weekSales,1)
  const totalPages=Math.max(1,Math.ceil(recentOrders.length/pageSize))
  const safePage=Math.min(page,totalPages)
  const visibleOrders=recentOrders.slice((safePage-1)*pageSize,safePage*pageSize)
  if(loading) return <div className="ownerPage"><PageHeader title="Carregando painel..." description="Buscando os dados da sua loja no Supabase." /></div>
  if(!store) return <div className="ownerPage"><PageHeader title="Sua loja ainda não foi encontrada" description="Conclua a configuração inicial para começar." action={<Link className="button" to="/onboarding">Configurar loja</Link>} /></div>
  const subMeta=subscriptionMeta(subscription)
  return <div className="ownerPage"><PageHeader title="Bom dia 👋" description={`Aqui está o caixa atual do ${store.name}.`} action={<Link className="button secondary" to={`/loja/${store.slug}`}><Eye size={18}/> Ver minha loja</Link>}/>
    <div className={`subscriptionNotice ${subMeta.tone}`}><div className="subscriptionNoticeIcon"><CalendarDays size={20}/></div><div><strong>{subMeta.label}</strong><span>{subMeta.detail}</span></div><Link to="/painel/configuracoes">Ver assinatura</Link></div>
    <section className="cashRegisterBar"><div><Clock3/><span><strong>Caixa atual aberto</strong><small>Pedidos desde {operationalStart(store).toLocaleString('pt-BR')}. Feche o caixa ao encerrar o expediente.</small></span></div><button className="button cashCloseButton" type="button" disabled={closingCash} onClick={closeCashRegister}>{closingCash?'Fechando...':'Fechar caixa do dia'}</button></section>
    {cashMessage&&<div className="successAlert">{cashMessage}</div>}{cashError&&<div className="infoAlert">{cashError}</div>}
    {newOrderAlert&&<div className={`newOrderLiveAlert ${store.new_order_flash_enabled!==false?'pulse':''}`}><div className="newOrderLiveIcon"><BellRing/></div><div><strong>Novo pedido #{newOrderAlert.number}</strong><span>{newOrderAlert.customer} · {formatBRL(newOrderAlert.total)}</span></div><Link className="button smallButton" to={`/painel/pedidos?pedido=${encodeURIComponent(newOrderAlert.id)}`}>Ver pedido</Link></div>}
    <div className="ownerStats"><StatCard label="Pedidos no caixa" value={String(stats.ordersToday)} helper="Desde o último fechamento" icon={ShoppingBag}/><StatCard label="Vendas no caixa" value={formatBRL(stats.salesToday)} helper={`Ticket médio ${formatBRL(averageTicket)}`} icon={DollarSign}/><StatCard label="Clientes" value={String(stats.customers)} helper="Clientes cadastrados" icon={Users}/><StatCard label="Produtos ativos" value={String(stats.products)} helper="Disponíveis na loja" icon={Box}/></div>
    <div className="ownerDashboardGrid"><section className="panelCard"><div className="panelTitle"><div><h2>Pedidos do caixa atual</h2><p>Depois de fechar o caixa, os pedidos ficam somente em Relatórios.</p></div><Link to="/painel/pedidos">Ver todos</Link></div><DashboardOrdersTable rows={visibleOrders} highlightedIds={highlightedOrderIds}/><PaginationControls page={safePage} pageSize={pageSize} total={recentOrders.length} onPage={setPage} onPageSize={(size)=>{setPageSize(size);setPage(1)}}/></section><section className="panelCard"><div className="panelTitle"><div><h2>Ações rápidas</h2><p>Atalhos para tarefas frequentes.</p></div></div><div className="quickActions"><Link to="/painel/produtos"><Plus/><span><strong>Novo produto</strong><small>Cadastre item e preço</small></span></Link><Link to="/painel/entregas"><Bike/><span><strong>Taxas de entrega</strong><small>Configure bairros</small></span></Link><Link to="/painel/minha-loja"><Store/><span><strong>Editar loja</strong><small>Dados e aparência</small></span></Link><Link to="/painel/pagamentos"><CreditCard/><span><strong>Pagamentos</strong><small>Pix e formas aceitas</small></span></Link></div></section></div>
    <section className="panelCard"><div className="panelTitle"><div><h2>Vendas dos últimos 7 dias</h2><p>Resumo financeiro. Os detalhes antigos ficam em Relatórios enquanto estiverem dentro da retenção.</p></div></div><div className="fakeChart">{weekSales.map((value,index)=><div key={index} title={formatBRL(value)} style={{height:`${Math.max(8,Math.round((value/maxWeek)*94))}%`}}></div>)}</div><div className="chartLabels"><span>6d</span><span>5d</span><span>4d</span><span>3d</span><span>2d</span><span>Ontem</span><span>Hoje</span></div></section>
  </div>
}

function DashboardOrdersTable({ rows, highlightedIds=[] }: { rows:any[]; highlightedIds?:string[] }) {
  if(!rows.length) return <div style={{padding:'28px 4px',color:'#697386'}}>Nenhum pedido no caixa atual.</div>
  return <div className="tableWrap"><table className="dataTable dashboardOrdersTable"><thead><tr><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Total</th><th>Status</th><th>Hora</th><th></th></tr></thead><tbody>{rows.map((order)=>{const customer=Array.isArray(order.customer)?order.customer[0]?.name:order.customer?.name;const isNew=highlightedIds.includes(String(order.id));return <tr key={order.id} className={isNew?'newOrderRowPulse':''}><td><strong>#{order.order_number||String(order.id).slice(0,6)}</strong>{isNew&&<span className="newOrderBadge">NOVO</span>}</td><td>{customer||'Cliente'}</td><td>{order.order_type==='delivery'?'Delivery':'Retirada'}</td><td>{formatBRL(Number(order.total||0))}</td><td><span className={`orderStatus ${order.status}`}>{statusLabel[order.status]||order.status}</span></td><td>{new Date(order.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</td><td><Link className="orderOpenButton" to={`/painel/pedidos?pedido=${encodeURIComponent(order.id)}`}>Ver pedido</Link></td></tr>})}</tbody></table></div>
}

function Orders() {
  const location=useLocation()
  const [filter,setFilter]=useState('todos')
  const [rows,setRows]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [pageSize,setPageSize]=useState(10)
  const [page,setPage]=useState(1)

  async function loadOrders(){
    if(!supabase){setError('Supabase não configurado.');setLoading(false);return}
    const {data:store,error:storeError}=await getOwnedStore()
    if(storeError||!store){setError(storeError?.message||'Loja não encontrada.');setLoading(false);return}
    try{await supabase.rpc('cleanup_my_expired_orders')}catch{}
    const activeStart=operationalStart(store)
    const result=await supabase.from('orders').select('id,order_number,order_type,payment_method,payment_status,paid_at,subtotal,delivery_fee,total,status,delivery_address,notes,age_confirmed,created_at,customer:customers(name,whatsapp)').eq('store_id',store.id).gte('created_at',activeStart.toISOString()).order('created_at',{ascending:false})
    if(result.error)setError(result.error.message);else setRows(result.data||[])
    setPage(1);setLoading(false)
  }
  useEffect(()=>{void loadOrders()},[])
  useEffect(()=>{const orderId=new URLSearchParams(location.search).get('pedido');if(orderId)setSelectedId(orderId)},[location.search])
  useEffect(()=>setPage(1),[filter,pageSize])
  const filtered=filter==='todos'?rows:rows.filter((order)=>order.status===filter)
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize)); const safePage=Math.min(page,totalPages); const visible=filtered.slice((safePage-1)*pageSize,safePage*pageSize)
  const selectedOrder=selectedId?rows.find((row)=>row.id===selectedId)||null:null
  async function updateStatus(orderId:string,status:string){if(!supabase)return;const old=rows.find((row)=>row.id===orderId)?.status;setRows((current)=>current.map((row)=>row.id===orderId?{...row,status}:row));const{error:updateError}=await supabase.from('orders').update({status}).eq('id',orderId);if(updateError){setRows((current)=>current.map((row)=>row.id===orderId?{...row,status:old}:row));setError(updateError.message);return}if(status==='out_for_delivery')void sendOrderWhatsapp({orderId,event:'out_for_delivery'})}
  async function markPixPaid(orderId:string){setError('');const result=await markManualPixPaid(orderId);if(result.error||!result.data){setError(result.error?.message||'Não foi possível confirmar o pagamento Pix.');return}const updated=result.data as any;setRows((current)=>current.map((row)=>row.id===orderId?{...row,payment_status:'paid',paid_at:updated.paid_at||new Date().toISOString(),status:updated.status||'preparing'}:row));void sendOrderWhatsapp({orderId,event:'payment_approved'})}
  return <div className="ownerPage"><PageHeader title="Pedidos" description="Pedidos do caixa atual. Fechamentos anteriores ficam em Relatórios."/>{error&&<div className="infoAlert" style={{marginBottom:16}}>{error}</div>}<div className="filterTabs">{[['todos','Todos'],['pending','Novos'],['accepted','Aceitos'],['preparing','Preparando'],['out_for_delivery','Em entrega'],['ready','Prontos'],['completed','Finalizados'],['cancelled','Cancelados']].map(([value,label])=><button key={value} onClick={()=>setFilter(value)} className={filter===value?'active':''}>{label}</button>)}</div><section className="panelCard">{loading?<div style={{padding:'28px 4px',color:'#697386'}}>Carregando pedidos...</div>:<><RealOrdersTable rows={visible} onStatus={updateStatus} onOpen={setSelectedId}/><PaginationControls page={safePage} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize}/></>}</section>{selectedOrder&&<OrderDetailsModal order={selectedOrder} onClose={()=>setSelectedId(null)} onStatus={updateStatus} onMarkPaid={markPixPaid}/>}</div>
}

function RealOrdersTable({ rows,onStatus,onOpen }:{rows:any[];onStatus:(id:string,status:string)=>void;onOpen:(id:string)=>void}){
  if(!rows.length)return <div style={{padding:'28px 4px',color:'#697386'}}>Nenhum pedido nesta categoria.</div>
  return <div className="tableWrap"><table className="dataTable orderManagementTable"><thead><tr><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Total</th><th>Status</th><th>Atualizar</th><th></th></tr></thead><tbody>{rows.map((order)=>{const customer=Array.isArray(order.customer)?order.customer[0]:order.customer;return <tr key={order.id}><td><strong>#{order.order_number||String(order.id).slice(0,6)}</strong><small>{new Date(order.created_at).toLocaleString('pt-BR')}</small></td><td>{customer?.name||'Cliente'}<small>{customer?.whatsapp||''}</small></td><td>{order.order_type==='delivery'?'Delivery':'Retirada'}</td><td>{formatBRL(Number(order.total||0))}</td><td><span className={`orderStatus ${order.status}`}>{statusLabel[order.status]||order.status}</span></td><td><select value={order.status} onChange={(e)=>onStatus(order.id,e.target.value)} style={{minWidth:150}}><option value="pending">Novo</option><option value="accepted">Aceito</option><option value="preparing">Preparando</option><option value="ready">Pronto</option>{order.order_type==='delivery'&&<option value="out_for_delivery">Saiu para entrega</option>}<option value="completed">Finalizado</option><option value="cancelled">Cancelado</option></select></td><td><button className="orderOpenButton" onClick={()=>onOpen(order.id)}>Ver pedido</button></td></tr>})}</tbody></table></div>
}

function OrderDetailsModal({ order, onClose, onStatus, onMarkPaid }: { order: any; onClose: () => void; onStatus: (id: string, status: string) => Promise<void> | void; onMarkPaid: (id: string) => Promise<void> | void }) {
  const [items, setItems] = useState<any[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [itemError, setItemError] = useState('')
  const [messageTemplates, setMessageTemplates] = useState<any[]>([])
  const [messageStoreName, setMessageStoreName] = useState('nossa loja')
  const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer

  useEffect(() => {
    let mounted = true
    async function loadItems() {
      if (!supabase) return
      setLoadingItems(true)
      const { data, error } = await supabase
        .from('order_items')
        .select('id,product_name,unit_label,quantity,unit_price,total')
        .eq('order_id', order.id)
        .order('id', { ascending: true })
      if (!mounted) return
      if (error) setItemError(error.message)
      else setItems(data || [])
      setLoadingItems(false)
    }
    loadItems()
    return () => { mounted = false }
  }, [order.id])

  useEffect(() => {
    let mounted = true
    async function loadTemplates() {
      if (!supabase) return
      const { data: ownedStore } = await getOwnedStore()
      if (!ownedStore || !mounted) return
      setMessageStoreName(ownedStore.name || 'nossa loja')
      const { data } = await supabase.from('store_message_templates').select('*').eq('store_id', ownedStore.id).eq('active', true).order('sort_order').order('created_at')
      if (mounted) setMessageTemplates(data || [])
    }
    loadTemplates()
    return () => { mounted = false }
  }, [order.id])

  const paymentLabel: Record<string,string> = { pix: 'Pix', cash: 'Dinheiro', card_on_delivery: 'Cartão na entrega' }
  const address = order.delivery_address || null
  const addressText = address ? [address.street, address.number, address.neighborhood, address.city && address.state ? `${address.city}/${address.state}` : address.city || address.state, address.cep].filter(Boolean).join(', ') : ''
  const digits = String(customer?.whatsapp || '').replace(/\D/g,'')
  const whatsappNumber = digits.startsWith('55') ? digits : digits ? `55${digits}` : ''
  const nextStatus = getNextOrderStatus(order.status, order.order_type)

  function templateText(text: string) {
    const orderId = order.order_number || String(order.id).slice(0,6)
    const payment = paymentLabel[order.payment_method] || order.payment_method
    const receipt = order.order_type === 'delivery' ? addressText : 'Retirada na loja'
    const replacements: Record<string,string> = {
      '{cliente}': customer?.name || 'Cliente',
      '{pedido}': String(orderId),
      '{loja}': messageStoreName,
      '{total}': formatBRL(Number(order.total || 0)),
      '{pagamento}': payment,
      '{recebimento}': order.order_type === 'delivery' ? 'Delivery' : 'Retirada',
      '{endereco}': receipt || 'Endereço não informado',
    }
    return Object.entries(replacements).reduce((value,[key,replacement]) => value.split(key).join(replacement), String(text || ''))
  }

  function openWhatsapp(messageText?: string) {
    if (!whatsappNumber) return
    const fallback = `Olá, ${customer?.name || ''}! Estamos falando sobre o seu pedido #${order.order_number || ''} no Pedevo.`
    const message = encodeURIComponent(messageText ? templateText(messageText) : fallback)
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank', 'noopener,noreferrer')
  }

  return <div className="modalBackdrop" onMouseDown={(event)=>{ if (event.target === event.currentTarget) onClose() }}>
    <div className="modalCard orderDetailModal">
      <div className="modalTitle"><div><h2>Pedido #{order.order_number || String(order.id).slice(0,6)}</h2><p>{new Date(order.created_at).toLocaleString('pt-BR')} · {order.order_type === 'delivery' ? 'Delivery' : 'Retirada'}</p></div><button onClick={onClose} aria-label="Fechar"><XCircle size={21}/></button></div>

      <div className="orderDetailTop">
        <div><span>Status</span><strong><span className={`orderStatus ${order.status}`}>{statusLabel[order.status] || order.status}</span></strong></div>
        <div><span>Total</span><strong>{formatBRL(Number(order.total || 0))}</strong></div>
        <div><span>Pagamento</span><strong>{paymentLabel[order.payment_method] || order.payment_method}{order.payment_method === 'pix' ? ` · ${order.payment_status === 'paid' ? 'Pago' : order.payment_status === 'manual_pending' ? 'Aguardando comprovante' : order.payment_status === 'pending' ? 'Aguardando confirmação' : order.payment_status || ''}` : ''}</strong></div>
      </div>

      <section className="orderDetailSection"><h3>Cliente</h3><div className="orderCustomerGrid"><div><span>Nome</span><strong>{customer?.name || 'Cliente'}</strong></div><div><span>WhatsApp</span><strong>{customer?.whatsapp || 'Não informado'}</strong></div></div>{whatsappNumber && <button className="button secondary smallButton" onClick={()=>openWhatsapp()}>Falar no WhatsApp</button>}</section>

      {order.payment_method === 'pix' && <section className="orderDetailSection manualPaymentOwnerSection"><h3><CreditCard size={17}/> Pagamento Pix</h3><div className="manualPaymentOwnerStatus"><div><span>Status</span><strong>{order.payment_status === 'paid' ? 'Pagamento confirmado' : order.payment_status === 'manual_pending' ? 'Aguardando comprovante' : order.payment_status === 'pending' ? 'Confirmação automática pendente' : order.payment_status || '—'}</strong></div>{order.payment_status === 'paid' && order.paid_at && <small>Confirmado em {new Date(order.paid_at).toLocaleString('pt-BR')}</small>}</div>{order.payment_status === 'manual_pending' && <button className="button paymentConfirmButton" onClick={()=>onMarkPaid(order.id)}><CheckCircle2 size={17}/> Marcar Pix como pago</button>}</section>}

      {whatsappNumber && messageTemplates.length > 0 && <section className="orderDetailSection"><h3><MessageCircle size={17}/> Mensagens rápidas</h3><p className="orderMuted">Escolha uma mensagem. O WhatsApp abrirá com o texto preenchido para você revisar e enviar.</p><div className="quickMessageButtons">{messageTemplates.map((template)=><button key={template.id} className="miniButton quickMessageButton" onClick={()=>openWhatsapp(template.message)}><MessageCircle size={14}/>{template.name}</button>)}</div></section>}

      {order.order_type === 'delivery' && <section className="orderDetailSection"><h3><MapPin size={17}/> Endereço de entrega</h3><p className="orderAddress">{addressText || 'Endereço não informado.'}</p>{address && <div className="deliveryAddressDetailGrid"><div><span>CEP</span><strong>{address.cep || '—'}</strong></div><div><span>Bairro</span><strong>{address.neighborhood || '—'}</strong></div><div><span>Cidade / UF</span><strong>{[address.city,address.state].filter(Boolean).join('/') || '—'}</strong></div><div><span>Complemento</span><strong>{address.complement || '—'}</strong></div><div className="wide"><span>Ponto de referência</span><strong>{address.reference || 'Não informado'}</strong></div></div>}</section>}

      <section className="orderDetailSection"><h3><Package size={17}/> Itens do pedido</h3>{loadingItems ? <p className="orderMuted">Carregando itens...</p> : itemError ? <p className="orderError">{itemError}</p> : <div className="orderItemsList">{items.map((item)=><div key={item.id}><div><strong>{item.quantity}x {item.product_name}</strong><small>{item.unit_label || 'unidade'} · {formatBRL(Number(item.unit_price || 0))} cada</small></div><b>{formatBRL(Number(item.total || 0))}</b></div>)}</div>}
        <div className="orderTotals"><div><span>Subtotal</span><strong>{formatBRL(Number(order.subtotal || 0))}</strong></div><div><span>Entrega</span><strong>{formatBRL(Number(order.delivery_fee || 0))}</strong></div><div className="grand"><span>Total</span><strong>{formatBRL(Number(order.total || 0))}</strong></div></div>
      </section>

      {order.notes && <section className="orderDetailSection"><h3>Observações</h3><p className="orderNotes">{order.notes}</p></section>}
      {order.age_confirmed && <div className="ageOrderNotice"><CheckCircle2 size={17}/> Cliente confirmou ter 18 anos ou mais.</div>}

      <section className="orderDetailSection"><h3>Atualizar pedido</h3><div className="orderStatusActions"><select value={order.status} onChange={(e)=>onStatus(order.id,e.target.value)}><option value="pending">Novo</option><option value="accepted">Aceito</option><option value="preparing">Preparando</option><option value="ready">Pronto</option>{order.order_type === 'delivery' && <option value="out_for_delivery">Saiu para entrega</option>}<option value="completed">Finalizado</option><option value="cancelled">Cancelado</option></select>{nextStatus && <button className="button" onClick={()=>onStatus(order.id,nextStatus.value)}>{nextStatus.label}</button>}</div>{order.status !== 'cancelled' && order.status !== 'completed' && <button className="cancelOrderButton" onClick={()=>onStatus(order.id,'cancelled')}>Cancelar pedido</button>}</section>
    </div>
  </div>
}

function getNextOrderStatus(status: string, orderType: string): { value: string; label: string } | null {
  if (status === 'pending') return { value: 'accepted', label: 'Aceitar pedido' }
  if (status === 'accepted') return { value: 'preparing', label: 'Iniciar preparo' }
  if (status === 'preparing') return { value: 'ready', label: orderType === 'delivery' ? 'Marcar como pronto' : 'Pronto para retirada' }
  if (status === 'ready' && orderType === 'delivery') return { value: 'out_for_delivery', label: 'Saiu para entrega' }
  if (status === 'ready' && orderType === 'pickup') return { value: 'completed', label: 'Finalizar pedido' }
  if (status === 'out_for_delivery') return { value: 'completed', label: 'Finalizar entrega' }
  return null
}

function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const toProduct = (row: any): Product => ({
    id: row.id,
    name: row.name,
    description: row.description || '',
    price: Number(row.price || 0),
    categoryId: row.category_id || '',
    image: row.image_url || undefined,
    emoji: row.image_url ? undefined : '📦',
    active: Boolean(row.active),
    unitLabel: row.unit_label || 'unidade',
    stock: row.stock ?? null,
    requiresAge18: Boolean(row.requires_age_18),
    featured: Boolean(row.featured),
  })

  async function loadProducts() {
    if (!supabase) {
      setError('Supabase não configurado.')
      setLoading(false)
      return
    }

    const { data: store, error: storeError } = await getOwnedStore()
    if (storeError || !store) {
      setError(storeError?.message || 'Loja não encontrada.')
      setLoading(false)
      return
    }

    setStoreId(store.id)
    const [productResult, categoryResult] = await Promise.all([
      supabase.from('products').select('*').eq('store_id', store.id).order('created_at', { ascending: false }),
      supabase.from('categories').select('*').eq('store_id', store.id).order('sort_order', { ascending: true }),
    ])

    if (productResult.error || categoryResult.error) {
      setError(productResult.error?.message || categoryResult.error?.message || 'Não foi possível carregar os produtos.')
    } else {
      setProducts((productResult.data || []).map(toProduct))
      setCategories(categoryResult.data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const visible = useMemo(
    () => products.filter((p) => {
      const category = categories.find((c) => c.id === p.categoryId)?.name || ''
      const term = query.toLowerCase()
      return p.name.toLowerCase().includes(term) || category.toLowerCase().includes(term)
    }),
    [products, query, categories],
  )

  function validateImage(file: FormDataEntryValue | null) {
    if (!(file instanceof File) || file.size === 0) return null
    if (file.size > 5 * 1024 * 1024) return 'A imagem deve ter no máximo 5 MB.'
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'Use uma imagem JPG, PNG ou WebP.'
    return null
  }

  async function addProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!storeId) return
    setSaving(true)
    setError('')
    setSuccess('')

    const form = event.currentTarget
    const f = new FormData(form)
    const file = f.get('image')
    const imageError = validateImage(file)
    if (imageError) {
      setError(imageError)
      setSaving(false)
      return
    }

    let imageUrl: string | null = null
    if (file instanceof File && file.size > 0) {
      const uploaded = await uploadProductImage(file)
      if (uploaded.error) {
        setError(`Não foi possível enviar a imagem: ${uploaded.error.message}`)
        setSaving(false)
        return
      }
      imageUrl = uploaded.url
    }

    const result = await createProduct(storeId, {
      name: String(f.get('name') || '').trim(),
      description: String(f.get('description') || '').trim(),
      price: Number(String(f.get('price') || '').replace(',', '.')) || 0,
      categoryId: String(f.get('category') || '') || null,
      unitLabel: String(f.get('unit') || 'unidade'),
      stock: String(f.get('stock') || '').trim() === '' ? null : Number(f.get('stock')),
      requiresAge18: f.get('age18') === 'on',
      imageUrl,
    })

    if (result.error || !result.data) {
      setError(result.error?.message || 'Não foi possível cadastrar o produto.')
      setSaving(false)
      return
    }

    setProducts((current) => [toProduct(result.data), ...current])
    form.reset()
    setModal(false)
    setSuccess('Produto cadastrado com sucesso.')
    setSaving(false)
  }

  async function editProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !editing) return
    setSaving(true)
    setError('')
    setSuccess('')

    const f = new FormData(event.currentTarget)
    const file = f.get('image')
    const imageError = validateImage(file)
    if (imageError) {
      setError(imageError)
      setSaving(false)
      return
    }

    let imageUrl = editing.image || null
    if (file instanceof File && file.size > 0) {
      const uploaded = await uploadProductImage(file)
      if (uploaded.error) {
        setError(`Não foi possível enviar a nova imagem: ${uploaded.error.message}`)
        setSaving(false)
        return
      }
      imageUrl = uploaded.url
    }

    const payload = {
      name: String(f.get('name') || '').trim(),
      description: String(f.get('description') || '').trim() || null,
      price: Number(String(f.get('price') || '').replace(',', '.')) || 0,
      category_id: String(f.get('category') || '') || null,
      unit_label: String(f.get('unit') || 'unidade'),
      stock: String(f.get('stock') || '').trim() === '' ? null : Number(f.get('stock')),
      requires_age_18: f.get('age18') === 'on',
      featured: f.get('featured') === 'on',
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    }

    const { data, error: updateError } = await supabase
      .from('products')
      .update(payload)
      .eq('id', editing.id)
      .select('*')
      .single()

    if (updateError || !data) {
      setError(updateError?.message || 'Não foi possível atualizar o produto.')
      setSaving(false)
      return
    }

    setProducts((current) => current.map((item) => item.id === editing.id ? toProduct(data) : item))
    setEditing(null)
    setSuccess('Produto atualizado com sucesso.')
    setSaving(false)
  }

  async function duplicateProduct(product: Product) {
    if (!supabase || !storeId) return
    setActionId(product.id)
    setError('')
    setSuccess('')

    const { data, error: duplicateError } = await supabase
      .from('products')
      .insert({
        store_id: storeId,
        category_id: product.categoryId || null,
        name: `${product.name} (cópia)`,
        description: product.description || null,
        price: product.price,
        image_url: product.image || null,
        unit_label: product.unitLabel || 'unidade',
        stock: product.stock ?? null,
        active: false,
        featured: Boolean(product.featured),
        requires_age_18: Boolean(product.requiresAge18),
      })
      .select('*')
      .single()

    if (duplicateError || !data) {
      setError(duplicateError?.message || 'Não foi possível duplicar o produto.')
    } else {
      const duplicated = toProduct(data)
      setProducts((current) => [duplicated, ...current])
      setSuccess('Produto duplicado. A cópia ficou desativada para você revisar antes de publicar.')
      setEditing(duplicated)
    }
    setActionId(null)
  }

  async function deleteProduct() {
    if (!supabase || !deleting) return
    setActionId(deleting.id)
    setError('')
    setSuccess('')

    const { error: deleteError } = await supabase.from('products').delete().eq('id', deleting.id)
    if (deleteError) {
      setError(`Não foi possível excluir o produto: ${deleteError.message}`)
    } else {
      setProducts((current) => current.filter((item) => item.id !== deleting.id))
      setSuccess('Produto excluído com sucesso.')
      setDeleting(null)
    }
    setActionId(null)
  }

  async function toggleProduct(product: Product) {
    if (!supabase) return
    const nextActive = !product.active
    setProducts((current) => current.map((item) => item.id === product.id ? { ...item, active: nextActive } : item))
    const { error: updateError } = await supabase.from('products').update({ active: nextActive, updated_at: new Date().toISOString() }).eq('id', product.id)
    if (updateError) {
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, active: product.active } : item))
      setError(`Não foi possível alterar o produto: ${updateError.message}`)
    }
  }

  if (loading) {
    return <div className="ownerPage"><PageHeader title="Produtos" description="Carregando os produtos da sua loja..."/></div>
  }

  return <div className="ownerPage"><PageHeader title="Produtos" description="Cadastre, edite e organize os itens disponíveis na sua loja." action={<button className="button" onClick={()=>{setEditing(null);setModal(true);setError('');setSuccess('')}}><Plus size={18}/> Adicionar produto</button>}/>
    {error && <div className="infoAlert productAlert error" style={{marginBottom:16}}>{error}</div>}
    {success && <div className="infoAlert productAlert success" style={{marginBottom:16}}>{success}</div>}
    <div className="ownerToolbar"><label className="searchBox"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar produto ou categoria..."/></label><span>{visible.length} produto{visible.length === 1 ? '' : 's'}</span></div>
    <section className="panelCard productAdminGrid productAdminGridV1">
      {visible.length === 0 && <div style={{padding:'28px 4px',color:'#697386'}}>Nenhum produto encontrado.</div>}
      {visible.map(p=><article className={`adminProduct adminProductV1 ${!p.active ? 'isInactive' : ''}`} key={p.id}>
        <div className="adminProductVisual">{p.image ? <img src={p.image} alt={p.name}/> : (p.emoji || '📦')}</div>
        <div className="adminProductInfo"><div className="productTitleLine"><strong>{p.name}</strong>{p.featured && <span className="featuredPill">Destaque</span>}</div><span>{categories.find(c=>c.id===p.categoryId)?.name || 'Sem categoria'}</span><b>{formatBRL(p.price)}</b><small>{p.stock===null?'Estoque não controlado':`${p.stock} em estoque`} {p.requiresAge18?'• 18+':''}</small></div>
        <div className="adminProductControls">
          <label className="switch" title={p.active ? 'Produto ativo' : 'Produto desativado'}><input type="checkbox" checked={p.active} onChange={()=>toggleProduct(p)}/><i></i></label>
          <div className="productActionButtons">
            <button type="button" title="Editar produto" onClick={()=>{setEditing(p);setError('');setSuccess('')}}><Pencil size={15}/><span>Editar</span></button>
            <button type="button" title="Duplicar produto" disabled={actionId===p.id} onClick={()=>duplicateProduct(p)}><Copy size={15}/><span>Duplicar</span></button>
            <button type="button" className="danger" title="Excluir produto" onClick={()=>{setDeleting(p);setError('');setSuccess('')}}><Trash2 size={15}/><span>Excluir</span></button>
          </div>
        </div>
      </article>)}
    </section>

    {modal && <div className="modalBackdrop"><div className="modalCard"><div className="modalTitle"><div><h2>Novo produto</h2><p>O produto será salvo na sua loja no Supabase.</p></div><button onClick={()=>setModal(false)}>×</button></div><form onSubmit={addProduct}>
      <label>Foto do produto
        <input name="image" type="file" accept="image/png,image/jpeg,image/webp"/>
        <small className="imageSpecText"><b>Tamanho recomendado: 1200 × 1200 px</b> · proporção 1:1 · JPG, PNG ou WebP · até 5 MB.</small>
      </label>
      <label>Nome<input name="name" required placeholder="Ex.: Coca-Cola Zero 2L"/></label>
      <label>Descrição<textarea name="description" rows={3} placeholder="Descrição curta"/></label>
      <div className="formGrid two"><label>Preço<input name="price" required inputMode="decimal" placeholder="10,00"/></label><label>Unidade<select name="unit"><option value="unidade">Unidade</option><option value="pack">Pack</option><option value="fardo">Fardo</option><option value="caixa">Caixa</option><option value="kg">Kg</option></select></label></div>
      <div className="formGrid two"><label>Categoria<select name="category" required><option value="">Selecione...</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Estoque<input name="stock" type="number" min="0" placeholder="Opcional"/></label></div>
      <label className="checkLine"><input type="checkbox" name="age18"/> Produto com venda exclusiva para maiores de 18 anos</label>
      <button className="button full large" disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar produto'}</button>
    </form></div></div>}

    {editing && <div className="modalBackdrop"><div className="modalCard"><div className="modalTitle"><div><h2>Editar produto</h2><p>Altere os dados e salve. A loja pública será atualizada automaticamente.</p></div><button onClick={()=>setEditing(null)}>×</button></div><form onSubmit={editProduct}>
      {editing.image && <div className="currentProductImage"><img src={editing.image} alt={editing.name}/><div><b>Imagem atual</b><small>Envie uma nova somente se quiser substituir.</small></div></div>}
      <label>Trocar foto (opcional)
        <input name="image" type="file" accept="image/png,image/jpeg,image/webp"/>
        <small className="imageSpecText"><b>1200 × 1200 px</b> · JPG, PNG ou WebP · até 5 MB.</small>
      </label>
      <label>Nome<input name="name" required defaultValue={editing.name}/></label>
      <label>Descrição<textarea name="description" rows={3} defaultValue={editing.description}/></label>
      <div className="formGrid two"><label>Preço<input name="price" required inputMode="decimal" defaultValue={editing.price.toFixed(2).replace('.', ',')}/></label><label>Unidade<select name="unit" defaultValue={editing.unitLabel || 'unidade'}><option value="unidade">Unidade</option><option value="pack">Pack</option><option value="fardo">Fardo</option><option value="caixa">Caixa</option><option value="kg">Kg</option></select></label></div>
      <div className="formGrid two"><label>Categoria<select name="category" required defaultValue={editing.categoryId}><option value="">Selecione...</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Estoque<input name="stock" type="number" min="0" defaultValue={editing.stock ?? ''} placeholder="Opcional"/></label></div>
      <label className="checkLine"><input type="checkbox" name="age18" defaultChecked={Boolean(editing.requiresAge18)}/> Produto com venda exclusiva para maiores de 18 anos</label>
      <label className="checkLine"><input type="checkbox" name="featured" defaultChecked={Boolean(editing.featured)}/> Destacar este produto na loja</label>
      <button className="button full large" disabled={saving}>{saving ? 'Salvando alterações...' : 'Salvar alterações'}</button>
    </form></div></div>}

    {deleting && <div className="modalBackdrop"><div className="modalCard confirmDeleteModal"><div className="deleteIcon"><Trash2 size={24}/></div><h2>Excluir produto?</h2><p>Você está prestes a excluir <b>{deleting.name}</b>. Essa ação remove o produto do catálogo e não pode ser desfeita.</p><div className="confirmDeleteActions"><button className="secondaryButton" type="button" onClick={()=>setDeleting(null)} disabled={actionId===deleting.id}>Cancelar</button><button className="dangerButton" type="button" onClick={deleteProduct} disabled={actionId===deleting.id}>{actionId===deleting.id ? 'Excluindo...' : 'Sim, excluir produto'}</button></div></div></div>}
  </div>
}

function Categories() {
  const [store, setStore] = useState<any>(null)
  const [categories, setCategories] = useState<any[]>([])
  const [productCounts, setProductCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [deleting, setDeleting] = useState<any>(null)

  async function loadCategories() {
    if (!supabase) {
      setError('Supabase não configurado.')
      setLoading(false)
      return
    }
    setError('')
    const { data: ownedStore, error: storeError } = await getOwnedStore()
    if (storeError || !ownedStore) {
      setError(storeError?.message || 'Loja não encontrada.')
      setLoading(false)
      return
    }
    setStore(ownedStore)
    const [categoryResult, productResult] = await Promise.all([
      supabase.from('categories').select('*').eq('store_id', ownedStore.id).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('products').select('category_id').eq('store_id', ownedStore.id),
    ])
    if (categoryResult.error || productResult.error) {
      setError(categoryResult.error?.message || productResult.error?.message || 'Não foi possível carregar as categorias.')
    } else {
      setCategories(categoryResult.data || [])
      const counts: Record<string, number> = {}
      for (const product of productResult.data || []) {
        if (!product.category_id) continue
        counts[product.category_id] = (counts[product.category_id] || 0) + 1
      }
      setProductCounts(counts)
    }
    setLoading(false)
  }

  useEffect(() => { loadCategories() }, [])

  function openNew() {
    setEditing(null)
    setModalOpen(true)
    setError('')
    setSuccess('')
  }

  function openEdit(category: any) {
    setEditing(category)
    setModalOpen(true)
    setError('')
    setSuccess('')
  }

  async function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !store) return
    setSaving(true)
    setError('')
    setSuccess('')
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || '').trim()
    const icon = String(form.get('icon') || '').trim() || '📦'
    const active = form.get('active') === 'on'
    if (!name) {
      setError('Informe o nome da categoria.')
      setSaving(false)
      return
    }
    const payload = {
      store_id: store.id,
      name,
      icon,
      active,
      sort_order: editing ? Number(editing.sort_order || 0) : categories.length,
    }
    const result = editing
      ? await supabase.from('categories').update(payload).eq('id', editing.id).select('*').single()
      : await supabase.from('categories').insert(payload).select('*').single()
    if (result.error || !result.data) {
      setError(result.error?.message || 'Não foi possível salvar a categoria.')
    } else {
      setCategories((current) => editing
        ? current.map((category) => category.id === editing.id ? result.data : category)
        : [...current, result.data])
      setModalOpen(false)
      setEditing(null)
      setSuccess(editing ? 'Categoria atualizada.' : 'Categoria criada.')
    }
    setSaving(false)
  }

  async function toggleCategory(category: any) {
    if (!supabase) return
    const next = !category.active
    setCategories((current) => current.map((item) => item.id === category.id ? { ...item, active: next } : item))
    const { error: updateError } = await supabase.from('categories').update({ active: next }).eq('id', category.id)
    if (updateError) {
      setCategories((current) => current.map((item) => item.id === category.id ? { ...item, active: category.active } : item))
      setError(updateError.message)
    } else {
      setSuccess(next ? 'Categoria ativada.' : 'Categoria desativada.')
    }
  }

  async function moveCategory(index: number, direction: -1 | 1) {
    if (!supabase) return
    const db = supabase
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= categories.length) return
    const reordered = [...categories]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)
    const normalized = reordered.map((category, sortIndex) => ({ ...category, sort_order: sortIndex }))
    setCategories(normalized)
    const updates = await Promise.all(normalized.map((category) => db.from('categories').update({ sort_order: category.sort_order }).eq('id', category.id)))
    const failed = updates.find((result) => result.error)
    if (failed?.error) {
      setError(failed.error.message)
      await loadCategories()
    } else {
      setSuccess('Ordem das categorias atualizada.')
    }
  }

  async function deleteCategory() {
    if (!supabase || !deleting) return
    setSaving(true)
    setError('')
    setSuccess('')
    const { error: deleteError } = await supabase.from('categories').delete().eq('id', deleting.id)
    if (deleteError) {
      setError(deleteError.message)
    } else {
      setCategories((current) => current.filter((category) => category.id !== deleting.id))
      setDeleting(null)
      setSuccess('Categoria excluída. Os produtos permaneceram cadastrados como “Sem categoria”.')
    }
    setSaving(false)
  }

  if (loading) return <div className="ownerPage"><PageHeader title="Categorias" description="Carregando categorias da sua loja..." /></div>

  return <div className="ownerPage">
    <PageHeader title="Categorias" description="Crie, organize e controle as categorias exibidas na sua loja." action={<button className="button" onClick={openNew}><Plus size={18}/> Nova categoria</button>}/>
    {error && <div className="infoAlert" style={{marginBottom:16}}>{error}</div>}
    {success && <div className="successAlert" style={{marginBottom:16}}>{success}</div>}
    <section className="panelCard">
      {categories.length === 0 ? <div className="categoryEmpty"><Tags size={34}/><div><strong>Nenhuma categoria cadastrada</strong><span>Crie a primeira categoria para organizar seus produtos.</span></div><button className="button secondary" onClick={openNew}><Plus size={16}/> Criar categoria</button></div> : <div className="categoryAdminList realCategoryList">{categories.map((category, index) => <div key={category.id}>
        <div className="categoryOrderButtons"><button disabled={index === 0} onClick={()=>moveCategory(index,-1)} title="Mover para cima">↑</button><button disabled={index === categories.length - 1} onClick={()=>moveCategory(index,1)} title="Mover para baixo">↓</button></div>
        <b className="categoryEmoji">{category.icon || '📦'}</b>
        <div><strong>{category.name}</strong><small>{productCounts[category.id] || 0} produto{(productCounts[category.id] || 0) === 1 ? '' : 's'}</small></div>
        <label className="switch compactSwitch" title={category.active ? 'Categoria ativa' : 'Categoria desativada'}><input type="checkbox" checked={Boolean(category.active)} onChange={()=>toggleCategory(category)}/><i></i></label>
        <span className={category.active ? 'activePill' : 'inactivePill'}>{category.active ? 'Ativa' : 'Oculta'}</span>
        <div className="categoryActions"><button className="miniButton" onClick={()=>openEdit(category)}><Pencil size={14}/> Editar</button><button className="miniButton dangerMiniButton" onClick={()=>setDeleting(category)}><Trash2 size={14}/> Excluir</button></div>
      </div>)}</div>}
    </section>

    {modalOpen && <div className="modalBackdrop" onMouseDown={(event)=>{ if (event.target === event.currentTarget) setModalOpen(false) }}><div className="modalCard categoryModal"><div className="modalTitle"><div><h2>{editing ? 'Editar categoria' : 'Nova categoria'}</h2><p>Nome e ícone que aparecerão no cardápio público.</p></div><button onClick={()=>setModalOpen(false)}>×</button></div><form onSubmit={saveCategory}>
      <div className="formGrid categoryNameGrid"><label>Ícone / emoji<input name="icon" maxLength={8} defaultValue={editing?.icon || '📦'} placeholder="🍔"/></label><label>Nome da categoria<input name="name" required maxLength={60} defaultValue={editing?.name || ''} placeholder="Ex.: Refrigerantes"/></label></div>
      <label className="checkLine categoryActiveCheck"><input type="checkbox" name="active" defaultChecked={editing ? Boolean(editing.active) : true}/> Mostrar esta categoria na loja pública</label>
      <button className="button full large" disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar categoria' : 'Criar categoria'}</button>
    </form></div></div>}

    {deleting && <div className="modalBackdrop"><div className="modalCard confirmDeleteModal"><div className="deleteIcon"><Trash2 size={26}/></div><h2>Excluir “{deleting.name}”?</h2><p>Os produtos dessa categoria <strong>não serão excluídos</strong>. Eles ficarão cadastrados como “Sem categoria” até você escolher outra.</p><div className="confirmDeleteActions"><button className="button secondary" onClick={()=>setDeleting(null)} disabled={saving}>Cancelar</button><button className="button dangerButton" onClick={deleteCategory} disabled={saving}>{saving ? 'Excluindo...' : 'Excluir categoria'}</button></div></div></div>}
  </div>
}

function Delivery() {
  const [store, setStore] = useState<any>(null)
  const [zones, setZones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [deliveryEnabled, setDeliveryEnabled] = useState(true)
  const [minOrder, setMinOrder] = useState('0,00')
  const [defaultFee, setDefaultFee] = useState('0,00')
  const [modal, setModal] = useState(false)
  const [editingZone, setEditingZone] = useState<any>(null)
  const [deletingZone, setDeletingZone] = useState<any>(null)

  async function loadDelivery() {
    if (!supabase) {
      setError('Supabase não configurado.')
      setLoading(false)
      return
    }
    setError('')
    const { data: ownedStore, error: storeError } = await getOwnedStore()
    if (storeError || !ownedStore) {
      setError(storeError?.message || 'Loja não encontrada.')
      setLoading(false)
      return
    }
    setStore(ownedStore)
    setDeliveryEnabled(Boolean(ownedStore.delivery_enabled))
    setMinOrder(Number(ownedStore.min_order || 0).toFixed(2).replace('.', ','))
    setDefaultFee(Number(ownedStore.default_delivery_fee || 0).toFixed(2).replace('.', ','))
    const result = await supabase.from('delivery_zones').select('*').eq('store_id', ownedStore.id).order('name')
    if (result.error) setError(result.error.message)
    else setZones(result.data || [])
    setLoading(false)
  }

  useEffect(() => { loadDelivery() }, [])

  function moneyValue(value: string) {
    const normalized = value.replace(/\./g, '').replace(',', '.')
    const number = Number(normalized)
    return Number.isFinite(number) ? Math.max(0, number) : 0
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !store) return
    setSaving(true)
    setError('')
    setSuccess('')
    const payload = {
      delivery_enabled: deliveryEnabled,
      min_order: moneyValue(minOrder),
      default_delivery_fee: moneyValue(defaultFee),
      updated_at: new Date().toISOString(),
    }
    const { error: updateError } = await supabase.from('stores').update(payload).eq('id', store.id)
    if (updateError) setError(updateError.message)
    else {
      setStore({ ...store, ...payload })
      setSuccess('Configurações de entrega salvas.')
    }
    setSaving(false)
  }

  function openNewZone() {
    setEditingZone(null)
    setModal(true)
  }

  function openEditZone(zone: any) {
    setEditingZone(zone)
    setModal(true)
  }

  async function saveZone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !store) return
    setSaving(true)
    setError('')
    setSuccess('')
    const form = new FormData(event.currentTarget)
    const payload = {
      store_id: store.id,
      name: String(form.get('name') || '').trim(),
      fee: moneyValue(String(form.get('fee') || '0')),
      eta_min_minutes: String(form.get('eta_min') || '').trim() === '' ? null : Number(form.get('eta_min')),
      eta_max_minutes: String(form.get('eta_max') || '').trim() === '' ? null : Number(form.get('eta_max')),
      active: form.get('active') === 'on',
    }
    const result = editingZone
      ? await supabase.from('delivery_zones').update(payload).eq('id', editingZone.id).select('*').single()
      : await supabase.from('delivery_zones').insert(payload).select('*').single()
    if (result.error || !result.data) {
      setError(result.error?.message || 'Não foi possível salvar o bairro.')
    } else {
      setZones((current) => editingZone
        ? current.map((zone) => zone.id === editingZone.id ? result.data : zone).sort((a,b) => a.name.localeCompare(b.name))
        : [...current, result.data].sort((a,b) => a.name.localeCompare(b.name)))
      setModal(false)
      setEditingZone(null)
      setSuccess(editingZone ? 'Bairro atualizado.' : 'Bairro adicionado.')
    }
    setSaving(false)
  }

  async function toggleZone(zone: any) {
    if (!supabase) return
    const next = !zone.active
    setZones((current) => current.map((item) => item.id === zone.id ? { ...item, active: next } : item))
    const { error: updateError } = await supabase.from('delivery_zones').update({ active: next }).eq('id', zone.id)
    if (updateError) {
      setZones((current) => current.map((item) => item.id === zone.id ? { ...item, active: zone.active } : item))
      setError(updateError.message)
    }
  }

  async function deleteZone() {
    if (!supabase || !deletingZone) return
    setSaving(true)
    setError('')
    const { error: deleteError } = await supabase.from('delivery_zones').delete().eq('id', deletingZone.id)
    if (deleteError) setError(deleteError.message)
    else {
      setZones((current) => current.filter((zone) => zone.id !== deletingZone.id))
      setSuccess(`Taxa de ${deletingZone.name} excluída. Esse bairro passará a usar a taxa padrão da cidade.`)
      setDeletingZone(null)
    }
    setSaving(false)
  }

  if (loading) return <div className="ownerPage"><PageHeader title="Entregas" description="Carregando configurações de entrega..."/></div>

  return <div className="ownerPage">
    <PageHeader title="Entregas" description="Configure delivery, pedido mínimo e taxas por bairro."/>
    {error && <div className="infoAlert" style={{marginBottom:16}}>{error}</div>}
    {success && <div className="successAlert" style={{marginBottom:16}}>{success}</div>}

    <form className="panelCard" onSubmit={saveSettings}>
      <div className="settingsSection"><div><h2>Delivery</h2><p>Permitir que clientes façam pedidos para entrega.</p></div><label className="switch"><input checked={deliveryEnabled} type="checkbox" onChange={e=>setDeliveryEnabled(e.target.checked)}/><i></i></label></div>
      <div className="serviceAreaOwnerNotice"><strong>Como a taxa de entrega funciona</strong><span>Defina uma taxa padrão para a cidade. Se um bairro tiver um valor diferente, cadastre esse bairro abaixo. Qualquer bairro sem taxa específica usa automaticamente a taxa padrão — assim nenhum pedido fica travado porque você esqueceu de cadastrar um bairro.</span></div><div className="formGrid two"><label>Pedido mínimo<input value={minOrder} onChange={(e)=>setMinOrder(e.target.value)} inputMode="decimal" placeholder="0,00"/><small>Valor mínimo dos produtos, antes da taxa de entrega.</small></label><label>Taxa padrão da cidade<input value={defaultFee} onChange={(e)=>setDefaultFee(e.target.value)} inputMode="decimal" placeholder="0,00"/><small>Aplicada automaticamente em qualquer bairro que não tenha uma taxa específica cadastrada.</small></label></div>
      <div className="deliverySettingsFooter"><div><strong>{deliveryEnabled ? 'Delivery ativo' : 'Delivery desativado'}</strong><span>{zones.filter((zone)=>zone.active).length} bairro(s) ativo(s)</span></div><button className="button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar configurações'}</button></div>
    </form>

    <section className="panelCard"><div className="panelTitle"><div><h2>Taxas específicas por bairro</h2><p>Cadastre somente os bairros que precisam cobrar um valor diferente da taxa padrão. O checkout identifica o bairro pelo CEP e calcula tudo automaticamente.</p></div><button className="button secondary" onClick={openNewZone}><Plus size={17}/> Adicionar bairro</button></div>
      {zones.length === 0 ? <div className="deliveryEmpty"><MapPin/><div><strong>Nenhuma taxa específica cadastrada</strong><span>Todos os bairros atendidos estão usando a taxa padrão da cidade. Cadastre aqui apenas os bairros com valor diferente.</span></div></div> : <div className="neighborhoodList realZones">{zones.map((zone)=><div key={zone.id}><MapPin/><div><strong>{zone.name}</strong><small>{zone.eta_min_minutes != null ? `${zone.eta_min_minutes}${zone.eta_max_minutes != null ? `–${zone.eta_max_minutes}` : ''} min` : 'Prazo não informado'}</small></div><b>{formatBRL(Number(zone.fee || 0))}</b><label className="switch compactSwitch"><input type="checkbox" checked={Boolean(zone.active)} onChange={()=>toggleZone(zone)}/><i></i></label><div className="zoneActionButtons"><button className="miniButton" onClick={()=>openEditZone(zone)}><Pencil size={14}/> Editar</button><button className="miniButton dangerMiniButton" onClick={()=>setDeletingZone(zone)}><Trash2 size={14}/> Excluir</button></div></div>)}</div>}
    </section>

    {modal && <div className="modalBackdrop" onMouseDown={(event)=>{ if (event.target === event.currentTarget) setModal(false) }}><div className="modalCard deliveryZoneModal"><div className="modalTitle"><div><h2>{editingZone ? 'Editar bairro' : 'Adicionar bairro'}</h2><p>Defina o valor cobrado e o prazo aproximado.</p></div><button onClick={()=>setModal(false)}>×</button></div><form onSubmit={saveZone}>
      <label>Nome do bairro / região<input name="name" required defaultValue={editingZone?.name || ''} placeholder="Ex.: Centro"/></label>
      <div className="formGrid two"><label>Taxa de entrega<input name="fee" required inputMode="decimal" defaultValue={editingZone ? Number(editingZone.fee || 0).toFixed(2).replace('.', ',') : ''} placeholder="5,00"/></label><label className="checkLine deliveryActiveCheck"><input type="checkbox" name="active" defaultChecked={editingZone ? Boolean(editingZone.active) : true}/> Bairro disponível para pedidos</label></div>
      <div className="formGrid two"><label>Prazo mínimo (min)<input name="eta_min" type="number" min="0" defaultValue={editingZone?.eta_min_minutes ?? ''} placeholder="25"/></label><label>Prazo máximo (min)<input name="eta_max" type="number" min="0" defaultValue={editingZone?.eta_max_minutes ?? ''} placeholder="40"/></label></div>
      <button className="button full large" disabled={saving}>{saving ? 'Salvando...' : editingZone ? 'Salvar bairro' : 'Adicionar bairro'}</button>
    </form></div></div>}
    {deletingZone && <div className="modalBackdrop"><div className="modalCard confirmDeleteModal"><div className="deleteIcon"><Trash2 size={26}/></div><h2>Excluir taxa de “{deletingZone.name}”?</h2><p>O bairro não será bloqueado. Depois da exclusão, ele passará a usar automaticamente a <strong>taxa padrão da cidade</strong>.</p><div className="confirmDeleteActions"><button className="button secondary" onClick={()=>setDeletingZone(null)} disabled={saving}>Cancelar</button><button className="button dangerButton" onClick={deleteZone} disabled={saving}>{saving ? 'Excluindo...' : 'Excluir taxa'}</button></div></div></div>}
  </div>
}

function Payments() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [store, setStore] = useState<any>(null)
  const [pixEnabled, setPixEnabled] = useState(true)
  const [pixKey, setPixKey] = useState('')
  const [cashEnabled, setCashEnabled] = useState(true)
  const [cardEnabled, setCardEnabled] = useState(true)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [pixAutoEnabled, setPixAutoEnabled] = useState(false)
  const [mercadoPagoToken, setMercadoPagoToken] = useState('')
  const [savingGateway, setSavingGateway] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data, error: loadError } = await getOwnedStore()
      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message || 'Não foi possível carregar as formas de pagamento.')
        setLoading(false)
        return
      }
      setStore(data)
      setPixEnabled(Boolean(data.pix_enabled))
      setPixKey(data.pix_key || '')
      setPixAutoEnabled(Boolean(data.pix_auto_enabled))
      setCashEnabled(Boolean(data.cash_enabled))
      setCardEnabled(Boolean(data.card_on_delivery_enabled))
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  async function savePayments(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !store) return
    setError('')
    setSuccess('')
    if (!pixEnabled && !cashEnabled && !cardEnabled) {
      setError('Ative pelo menos uma forma de pagamento.')
      return
    }
    if (pixEnabled && !pixAutoEnabled && !pixKey.trim()) {
      setError('Informe a chave Pix para usar o modo manual ou conecte o Mercado Pago.')
      return
    }
    setSaving(true)
    const { data, error: updateError } = await supabase.from('stores').update({
      pix_enabled: pixEnabled,
      pix_key: pixEnabled ? (pixKey.trim() || null) : null,
      pix_auto_enabled: pixEnabled ? pixAutoEnabled : false,
      cash_enabled: cashEnabled,
      card_on_delivery_enabled: cardEnabled,
    }).eq('id', store.id).select('*').single()
    if (updateError || !data) setError(updateError?.message || 'Não foi possível salvar as formas de pagamento.')
    else {
      setStore(data)
      setSuccess('Formas de pagamento atualizadas com sucesso.')
    }
    setSaving(false)
  }

  async function saveAutomaticPix() {
    if (!store) return
    setError('')
    setSuccess('')
    if (!mercadoPagoToken.trim()) {
      setError('Cole o Access Token de produção do Mercado Pago para ativar o Pix automático.')
      return
    }
    setSavingGateway(true)
    const result = await saveMercadoPagoToken(store.id, mercadoPagoToken.trim())
    if (result.error) setError(result.error.message || 'Não foi possível conectar o Mercado Pago.')
    else {
      setPixAutoEnabled(true)
      setMercadoPagoToken('')
      setSuccess('Mercado Pago conectado. O Pix automático está ativo para esta loja.')
    }
    setSavingGateway(false)
  }

  async function useManualPix() {
    if (!supabase || !store) return
    setError('')
    setSuccess('')
    if (!pixKey.trim()) {
      setError('Informe primeiro a chave Pix que receberá os pagamentos manuais.')
      return
    }
    setSavingGateway(true)
    const { error: updateError } = await supabase.from('stores').update({ pix_auto_enabled: false, pix_key: pixKey.trim() }).eq('id', store.id)
    if (updateError) setError(updateError.message)
    else {
      setPixAutoEnabled(false)
      setSuccess('Pix manual ativado. O Pedevo gerará QR Code e Pix Copia e Cola usando a chave e o valor de cada pedido.')
    }
    setSavingGateway(false)
  }

  if (loading) return <div className="ownerPage"><PageHeader title="Pagamentos" description="Carregando formas de pagamento..."/></div>

  return <div className="ownerPage">
    <PageHeader title="Pagamentos" description="Escolha como seus clientes podem pagar os pedidos."/>
    {error && <div className="infoAlert" style={{marginBottom:16}}>{error}</div>}
    {success && <div className="successAlert" style={{marginBottom:16}}>{success}</div>}
    <form onSubmit={savePayments}>
      <section className="panelCard">
        <div className="paymentSetting"><span>◈</span><div><strong>Pix</strong><p>Escolha entre cobrança manual pela sua chave ou confirmação automática pelo Mercado Pago.</p></div><label className="switch"><input type="checkbox" checked={pixEnabled} onChange={(e)=>setPixEnabled(e.target.checked)}/><i></i></label></div>
        {pixEnabled && <div className="pixModeGrid"><button type="button" className={!pixAutoEnabled ? 'pixModeCard active' : 'pixModeCard'} onClick={useManualPix}><span>🔑</span><div><strong>Pix manual</strong><small>QR Code + Copia e Cola gerados pela chave da loja. O cliente envia comprovante e você confirma o pagamento.</small></div>{!pixAutoEnabled && <b>Em uso</b>}</button><div className={pixAutoEnabled ? 'pixModeCard active static' : 'pixModeCard static'}><span>⚡</span><div><strong>Pix automático</strong><small>Mercado Pago confirma o pagamento por webhook e atualiza o pedido automaticamente.</small></div>{pixAutoEnabled && <b>Em uso</b>}</div></div>}
        {pixEnabled && !pixAutoEnabled && <label>Chave Pix do modo manual<input value={pixKey} onChange={(e)=>setPixKey(e.target.value)} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"/><small>O Pedevo usa essa chave + o valor do pedido para gerar QR Code e Pix Copia e Cola. Informe a chave exatamente como está cadastrada no banco. O prazo de 10 minutos é do pedido no Pedevo; uma cobrança Pix estática não pode ser invalidada pelo banco automaticamente.</small></label>}
      </section>
      <section className="panelCard">
        <div className="paymentSetting"><span>💵</span><div><strong>Dinheiro</strong><p>O cliente poderá informar no checkout o valor para troco.</p></div><label className="switch"><input type="checkbox" checked={cashEnabled} onChange={(e)=>setCashEnabled(e.target.checked)}/><i></i></label></div>
        <div className="paymentSetting"><span>💳</span><div><strong>Cartão na entrega ou retirada</strong><p>Débito ou crédito na maquininha da loja ou do entregador.</p></div><label className="switch"><input type="checkbox" checked={cardEnabled} onChange={(e)=>setCardEnabled(e.target.checked)}/><i></i></label></div>
      </section>
      <div className="paymentSaveBar"><div><strong>{[pixEnabled, cashEnabled, cardEnabled].filter(Boolean).length} forma(s) ativa(s)</strong><span>O checkout será atualizado automaticamente.</span></div><button className="button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar pagamentos'}</button></div>
    </form>
    <section className="panelCard autoPixOwnerCard">
      <div className="panelTitle"><div><h2>Automação Pix — Mercado Pago</h2><p>Opcional. Use se quiser confirmação automática sem conferir comprovante.</p></div><span className={pixAutoEnabled ? 'gatewayBadge connected' : 'gatewayBadge'}>{pixAutoEnabled ? 'Automático ativo' : 'Modo manual'}</span></div>
      <div className="gatewayExplanation"><strong>Automático</strong><span>Ao conectar a conta Mercado Pago que receberá as vendas, cada pedido gera um Pix único. O webhook confirma o pagamento e o Pedevo muda o pedido para “Preparando”. Se preferir não conectar nada, continue no Pix manual.</span></div>
      <label>Access Token de produção do Mercado Pago<input type="password" value={mercadoPagoToken} onChange={(e)=>setMercadoPagoToken(e.target.value)} placeholder="APP_USR-..." autoComplete="off"/><small>Esse token vai para uma Edge Function segura no Supabase e não deve ser enviado para o GitHub.</small></label>
      <div className="gatewayActions"><button type="button" className="button" disabled={savingGateway} onClick={saveAutomaticPix}>{savingGateway ? 'Conectando...' : pixAutoEnabled ? 'Atualizar conexão Mercado Pago' : 'Conectar e usar Pix automático'}</button>{pixAutoEnabled && <button type="button" className="button secondary" disabled={savingGateway} onClick={useManualPix}>Voltar para Pix manual</button>}</div>
    </section>
    <div className="infoAlert">No modo manual, o cliente vê QR Code + Pix Copia e Cola, tem 10 minutos para pagar e pode abrir o WhatsApp para enviar o comprovante. Você confirma em <strong>Pedidos → Marcar Pix como pago</strong>. No modo automático, o Mercado Pago confirma sozinho.</div>
  </div>
}

function Reports() {
  type Period = 'today' | '24h' | '48h'
  const [period,setPeriod]=useState<Period>('48h')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [orders,setOrders]=useState<any[]>([])
  const [items,setItems]=useState<any[]>([])
  const [closings,setClosings]=useState<any[]>([])
  const [newCustomers,setNewCustomers]=useState(0)
  const [rangeLabel,setRangeLabel]=useState('')
  const [rangeStart,setRangeStart]=useState<Date>(new Date())
  const [store,setStore]=useState<any>(null)
  const [retentionHours,setRetentionHours]=useState<24|48>(48)
  const [savingRetention,setSavingRetention]=useState(false)
  const [orderPageSize,setOrderPageSize]=useState(10)
  const [orderPage,setOrderPage]=useState(1)

  function getRange(selected:Period){const now=new Date();const start=new Date(now);if(selected==='today')start.setHours(0,0,0,0);if(selected==='24h')start.setHours(start.getHours()-24);if(selected==='48h')start.setHours(start.getHours()-48);const label=selected==='today'?'Hoje':selected==='24h'?'Últimas 24 horas':'Últimas 48 horas';return{start,end:now,label}}

  async function loadReports(){
    if(!supabase){setError('Supabase não configurado.');setLoading(false);return}
    setLoading(true);setError('')
    const {data:ownedStore,error:storeError}=await getOwnedStore()
    if(storeError||!ownedStore){setError(storeError?.message||'Loja não encontrada.');setLoading(false);return}
    setStore(ownedStore);setRetentionHours(Number(ownedStore.order_retention_hours)===24?24:48)
    try{await supabase.rpc('cleanup_my_expired_orders')}catch{}
    const {start,end,label}=getRange(period);setRangeStart(start);setRangeLabel(label)
    const [ordersResult,customersResult,closingsResult]=await Promise.all([
      supabase.from('orders').select('id,order_number,customer_id,order_type,payment_method,status,subtotal,delivery_fee,total,created_at,customer:customers(name,whatsapp)').eq('store_id',ownedStore.id).gte('created_at',start.toISOString()).lte('created_at',end.toISOString()).order('created_at',{ascending:false}),
      supabase.from('customers').select('id',{count:'exact',head:true}).eq('store_id',ownedStore.id).gte('created_at',start.toISOString()).lte('created_at',end.toISOString()),
      supabase.from('cash_closings').select('*').eq('store_id',ownedStore.id).order('closed_at',{ascending:false}).limit(30),
    ])
    if(ordersResult.error){setError(ordersResult.error.message);setLoading(false);return}
    const loadedOrders=ordersResult.data||[];let loadedItems:any[]=[]
    if(loadedOrders.length){const itemResult=await supabase.from('order_items').select('order_id,product_id,product_name,quantity,total').in('order_id',loadedOrders.map((order:any)=>order.id));if(itemResult.error)setError(itemResult.error.message);else loadedItems=itemResult.data||[]}
    setOrders(loadedOrders);setItems(loadedItems);setClosings(closingsResult.data||[]);setNewCustomers(customersResult.count||0);setOrderPage(1);setLoading(false)
  }
  useEffect(()=>{void loadReports()},[period])

  async function saveRetention(hours:24|48){if(!supabase||!store?.id)return;setSavingRetention(true);setError('');setSuccess('');const{data,error:updateError}=await supabase.from('stores').update({order_retention_hours:hours}).eq('id',store.id).select('*').single();if(updateError)setError(updateError.message);else{setStore(data);setRetentionHours(hours);setSuccess(`Retenção alterada para ${hours} horas. Os pedidos fechados serão excluídos automaticamente após esse prazo.`)}setSavingRetention(false)}

  const validOrders=useMemo(()=>orders.filter((order:any)=>order.status!=='cancelled'),[orders]);const cancelledOrders=useMemo(()=>orders.filter((order:any)=>order.status==='cancelled'),[orders]);const completedOrders=useMemo(()=>orders.filter((order:any)=>order.status==='completed'),[orders]);const sales=validOrders.reduce((sum:number,order:any)=>sum+Number(order.total||0),0);const averageTicket=validOrders.length?sales/validOrders.length:0;const finishedCount=completedOrders.length+cancelledOrders.length;const completionRate=finishedCount?(completedOrders.length/finishedCount)*100:0
  const dailySales=useMemo(()=>{const start=new Date(rangeStart);const end=new Date();const result:Array<{key:string;label:string;total:number}>=[];const cursor=new Date(start);while(cursor<=end&&result.length<4){result.push({key:cursor.toLocaleDateString('pt-BR'),label:cursor.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),total:0});cursor.setDate(cursor.getDate()+1)}validOrders.forEach((order:any)=>{const key=new Date(order.created_at).toLocaleDateString('pt-BR');const bucket=result.find((entry)=>entry.key===key);if(bucket)bucket.total+=Number(order.total||0)});return result},[validOrders,rangeStart])
  const topProducts=useMemo(()=>{const validIds=new Set(validOrders.map((o:any)=>o.id));const grouped=new Map<string,{name:string;quantity:number;revenue:number}>();items.forEach((item:any)=>{if(!validIds.has(item.order_id))return;const key=item.product_id||item.product_name;const current=grouped.get(key)||{name:item.product_name||'Produto',quantity:0,revenue:0};current.quantity+=Number(item.quantity||0);current.revenue+=Number(item.total||0);grouped.set(key,current)});return Array.from(grouped.values()).sort((a,b)=>b.quantity-a.quantity||b.revenue-a.revenue).slice(0,5)},[items,validOrders])
  const paymentBreakdown=useMemo(()=>{const labels:Record<string,string>={pix:'Pix',cash:'Dinheiro',card_on_delivery:'Cartão'};const grouped=new Map<string,{method:string;count:number;total:number}>();validOrders.forEach((order:any)=>{const key=order.payment_method||'outro';const current=grouped.get(key)||{method:labels[key]||key,count:0,total:0};current.count++;current.total+=Number(order.total||0);grouped.set(key,current)});return Array.from(grouped.values()).sort((a,b)=>b.total-a.total)},[validOrders])
  const serviceBreakdown=useMemo(()=>{const delivery=validOrders.filter((o:any)=>o.order_type==='delivery');const pickup=validOrders.filter((o:any)=>o.order_type==='pickup');return[{label:'Delivery',count:delivery.length,total:delivery.reduce((s:number,o:any)=>s+Number(o.total||0),0),icon:'🛵'},{label:'Retirada',count:pickup.length,total:pickup.reduce((s:number,o:any)=>s+Number(o.total||0),0),icon:'🏪'}]},[validOrders])
  function exportCsv(){const header=['Pedido','Data','Cliente','Tipo','Pagamento','Status','Subtotal','Entrega','Total'];const labels:Record<string,string>={pix:'Pix',cash:'Dinheiro',card_on_delivery:'Cartão'};const rows=orders.map((order:any)=>{const customer=Array.isArray(order.customer)?order.customer[0]:order.customer;return[order.order_number||order.id,new Date(order.created_at).toLocaleString('pt-BR'),customer?.name||'',order.order_type==='delivery'?'Delivery':'Retirada',labels[order.payment_method]||order.payment_method,statusLabel[order.status]||order.status,Number(order.subtotal||0).toFixed(2).replace('.',','),Number(order.delivery_fee||0).toFixed(2).replace('.',','),Number(order.total||0).toFixed(2).replace('.',',')]});const quote=(value:any)=>`"${String(value??'').replace(/"/g,'""')}"`;const csv=[header,...rows].map((row)=>row.map(quote).join(';')).join('\n');const blob=new Blob([`\uFEFF${csv}`],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`pedevo-relatorio-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}
  const maxDaily=Math.max(...dailySales.map((entry)=>entry.total),1);const totalOrderPages=Math.max(1,Math.ceil(orders.length/orderPageSize));const safeOrderPage=Math.min(orderPage,totalOrderPages);const visibleOrders=orders.slice((safeOrderPage-1)*orderPageSize,safeOrderPage*orderPageSize)
  return <div className="ownerPage"><PageHeader title="Relatórios" description="Consulte pedidos fechados e resumos do caixa enquanto estiverem disponíveis." action={<button type="button" className="button secondary" onClick={exportCsv} disabled={!orders.length}>Exportar CSV</button>}/>
    <section className="retentionNotice"><AlertTriangle/><div><strong>Retenção dos pedidos detalhados: {retentionHours} horas</strong><span>Após fechar o caixa, os pedidos continuam aqui por {retentionHours} horas e depois são apagados automaticamente. Os resumos de fechamento permanecem salvos.</span></div><div className="retentionChoice"><button type="button" disabled={savingRetention} className={retentionHours===24?'active':''} onClick={()=>saveRetention(24)}>24 horas</button><button type="button" disabled={savingRetention} className={retentionHours===48?'active':''} onClick={()=>saveRetention(48)}>48 horas</button></div></section>
    {success&&<div className="successAlert">{success}</div>}{error&&<div className="infoAlert">{error}</div>}
    <div className="reportToolbar"><div><strong>Período</strong><span>{rangeLabel}</span></div><div className="reportPeriodTabs">{([['today','Hoje'],['24h','24 horas'],['48h','48 horas']] as Array<[Period,string]>).map(([value,label])=><button type="button" key={value} className={period===value?'active':''} onClick={()=>setPeriod(value)}>{label}</button>)}</div></div>
    {loading?<section className="panelCard"><div style={{padding:'28px 4px',color:'#697386'}}>Carregando relatórios...</div></section>:<>
      <div className="ownerStats reportStats"><StatCard label="Faturamento" value={formatBRL(sales)} helper={`${validOrders.length} pedido(s) válido(s)`} icon={DollarSign}/><StatCard label="Pedidos" value={String(orders.length)} helper={`Ticket médio ${formatBRL(averageTicket)}`} icon={ShoppingBag}/><StatCard label="Novos clientes" value={String(newCustomers)} helper={rangeLabel} icon={Users}/><StatCard label="Taxa de conclusão" value={`${completionRate.toFixed(1).replace('.',',')}%`} helper={`${cancelledOrders.length} cancelado(s)`} icon={CheckCircle2}/></div>
      <section className="panelCard"><div className="panelTitle"><div><h2>Pedidos disponíveis</h2><p>Aqui aparecem os pedidos do caixa atual e dos fechamentos recentes, até o prazo de retenção.</p></div></div><ReportOrdersTable rows={visibleOrders}/><PaginationControls page={safeOrderPage} pageSize={orderPageSize} total={orders.length} onPage={setOrderPage} onPageSize={(size)=>{setOrderPageSize(size);setOrderPage(1)}}/></section>
      <section className="panelCard cashClosingHistory"><div className="panelTitle"><div><h2>Histórico de fechamento de caixa</h2><p>Os resumos permanecem mesmo depois que os pedidos detalhados forem apagados.</p></div></div>{closings.length?<div className="tableWrap"><table className="dataTable"><thead><tr><th>Fechado em</th><th>Pedidos</th><th>Cancelados</th><th>Pix</th><th>Dinheiro</th><th>Cartão</th><th>Faturamento</th></tr></thead><tbody>{closings.map((closing:any)=><tr key={closing.id}><td>{new Date(closing.closed_at).toLocaleString('pt-BR')}</td><td>{closing.orders_count}</td><td>{closing.cancelled_orders_count}</td><td>{formatBRL(Number(closing.pix_sales||0))}</td><td>{formatBRL(Number(closing.cash_sales||0))}</td><td>{formatBRL(Number(closing.card_sales||0))}</td><td><strong>{formatBRL(Number(closing.gross_sales||0))}</strong></td></tr>)}</tbody></table></div>:<div className="reportEmpty">Nenhum fechamento de caixa registrado ainda.</div>}</section>
      <section className="panelCard reportChartCard"><div className="panelTitle"><div><h2>Vendas por dia</h2><p>Pedidos cancelados não entram no faturamento.</p></div><strong>{formatBRL(sales)}</strong></div>{dailySales.some((entry)=>entry.total>0)?<><div className="reportChart" style={{gridTemplateColumns:`repeat(${dailySales.length}, minmax(7px, 1fr))`}}>{dailySales.map((entry)=><div className="reportBarColumn" key={entry.key} title={`${entry.label}: ${formatBRL(entry.total)}`}><div className="reportBar" style={{height:`${Math.max(entry.total?8:2,Math.round((entry.total/maxDaily)*100))}%`}}></div></div>)}</div><div className="reportChartRange"><span>{dailySales[0]?.label}</span><span></span><span>{dailySales[dailySales.length-1]?.label}</span></div></>:<div className="reportEmpty">Ainda não há vendas neste período.</div>}</section>
      <div className="reportGrid"><section className="panelCard"><div className="panelTitle"><div><h2>Produtos mais vendidos</h2><p>Ranking dos pedidos ainda disponíveis.</p></div></div>{topProducts.length?<div className="rankList realRankList">{topProducts.map((product,index)=><div key={`${product.name}-${index}`}><span>{index+1}</span><b>📦</b><div><strong>{product.name}</strong><small>{product.quantity} unidade(s)</small></div><em>{formatBRL(product.revenue)}</em></div>)}</div>:<div className="reportEmpty">Nenhum produto vendido no período.</div>}</section><section className="panelCard"><div className="panelTitle"><div><h2>Formas de pagamento</h2><p>Como os clientes pagaram.</p></div></div>{paymentBreakdown.length?<div className="reportBreakdownList">{paymentBreakdown.map((entry)=><div key={entry.method}><span className="reportBreakdownIcon"><CreditCard size={18}/></span><div><strong>{entry.method}</strong><small>{entry.count} pedido(s)</small></div><em>{formatBRL(entry.total)}</em></div>)}</div>:<div className="reportEmpty">Sem pagamentos neste período.</div>}</section></div>
      <section className="panelCard"><div className="panelTitle"><div><h2>Delivery x retirada</h2><p>Compare os canais usados pelos clientes.</p></div></div><div className="serviceReportGrid">{serviceBreakdown.map((entry)=><div key={entry.label}><span>{entry.icon}</span><div><strong>{entry.label}</strong><small>{entry.count} pedido(s)</small></div><em>{formatBRL(entry.total)}</em></div>)}</div></section>
    </>}
  </div>
}

function ReportOrdersTable({rows}:{rows:any[]}){
  if(!rows.length)return <div className="reportEmpty">Nenhum pedido disponível neste período.</div>
  return <div className="tableWrap"><table className="dataTable reportOrdersTable"><thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Tipo</th><th>Pagamento</th><th>Status</th><th>Total</th></tr></thead><tbody>{rows.map((order:any)=>{const customer=Array.isArray(order.customer)?order.customer[0]:order.customer;const pay:Record<string,string>={pix:'Pix',cash:'Dinheiro',card_on_delivery:'Cartão'};return <tr key={order.id}><td><strong>#{order.order_number||String(order.id).slice(0,6)}</strong></td><td>{new Date(order.created_at).toLocaleString('pt-BR')}</td><td>{customer?.name||'Cliente'}</td><td>{order.order_type==='delivery'?'Delivery':'Retirada'}</td><td>{pay[order.payment_method]||order.payment_method}</td><td><span className={`orderStatus ${order.status}`}>{statusLabel[order.status]||order.status}</span></td><td><strong>{formatBRL(Number(order.total||0))}</strong></td></tr>})}</tbody></table></div>
}

function MyStore() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [store, setStore] = useState<any>(null)
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [stateCode, setStateCode] = useState('TO')
  const [slug, setSlug] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#ff5a1f')
  const [isOpen, setIsOpen] = useState(true)
  const [ageRestricted, setAgeRestricted] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [bannerPreview, setBannerPreview] = useState('')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [pixAutoEnabled, setPixAutoEnabled] = useState(false)
  const [mercadoPagoToken, setMercadoPagoToken] = useState('')
  const [savingGateway, setSavingGateway] = useState(false)
  const [authExpired, setAuthExpired] = useState(false)
  const [hours, setHours] = useState<OpeningHours>({
    mon:{enabled:true,open:'08:00',close:'18:00'}, tue:{enabled:true,open:'08:00',close:'18:00'}, wed:{enabled:true,open:'08:00',close:'18:00'},
    thu:{enabled:true,open:'08:00',close:'18:00'}, fri:{enabled:true,open:'08:00',close:'18:00'}, sat:{enabled:true,open:'08:00',close:'14:00'}, sun:{enabled:false,open:'08:00',close:'12:00'},
  })

  const dayList: Array<{key:keyof OpeningHours; label:string}> = [
    {key:'mon',label:'Segunda'}, {key:'tue',label:'Terça'}, {key:'wed',label:'Quarta'}, {key:'thu',label:'Quinta'}, {key:'fri',label:'Sexta'}, {key:'sat',label:'Sábado'}, {key:'sun',label:'Domingo'},
  ]

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data, error: loadError } = await getOwnedStore()
      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message || 'Não foi possível carregar os dados da loja.')
        setLoading(false)
        return
      }
      setStore(data)
      setName(data.name || '')
      setWhatsapp(data.whatsapp || '')
      setDescription(data.description || '')
      setAddress(data.address_line || '')
      setCity(data.city || '')
      setStateCode(data.state || 'TO')
      setSlug(data.slug || '')
      setPrimaryColor(data.primary_color || '#ff5a1f')
      setIsOpen(Boolean(data.is_open))
      setAgeRestricted(Boolean(data.age_restricted_sales))
      setLogoPreview(data.logo_url || '')
      setBannerPreview(data.banner_url || '')
      if (data.opening_hours && Object.keys(data.opening_hours).length) setHours((prev)=>({ ...prev, ...data.opening_hours }))
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!supabase) return
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthExpired(false)
        setError((current) => /auth session missing|sess[aã]o expirada|entre novamente/i.test(current) ? '' : current)
      }
    })
    return () => authListener.subscription.unsubscribe()
  }, [])

  function normalizeSlug(value:string) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)
  }

  function updateHour(day:keyof OpeningHours, patch:Record<string,any>) {
    setHours((current)=>({ ...current, [day]: { ...(current[day] || {enabled:false,open:'08:00',close:'18:00'}), ...patch } }))
  }

  function pickImage(file:File | null, kind:'logo'|'banner') {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Escolha um arquivo de imagem.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('A imagem deve ter no máximo 5 MB.'); return }
    const preview = URL.createObjectURL(file)
    if (kind === 'logo') { setLogoFile(file); setLogoPreview(preview) }
    else { setBannerFile(file); setBannerPreview(preview) }
  }

  async function requireSession() {
    if (!supabase) throw new Error('Supabase não configurado.')
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session) return sessionData.session

    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed.session) return refreshed.session

    setAuthExpired(true)
    throw new Error('Sua sessão expirou. Entre novamente em outra aba e depois volte aqui para salvar sem perder o formulário.')
  }

  async function uploadAsset(file:File, kind:'logo'|'banner', userId:string) {
    if (!supabase) throw new Error('Supabase não configurado.')
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${userId}/${kind}-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('store-assets').upload(path, file, { cacheControl:'3600', upsert:false, contentType:file.type })
    if (uploadError) throw uploadError
    return supabase.storage.from('store-assets').getPublicUrl(path).data.publicUrl
  }

  async function saveStore(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !store) return
    setSaving(true); setError(''); setSuccess('')
    try {
      if (!name.trim()) throw new Error('Informe o nome da loja.')
      const session = await requireSession()
      const cleanSlug = normalizeSlug(slug || name)
      if (!cleanSlug) throw new Error('Defina uma URL válida para a loja.')
      let logoUrl = store.logo_url || null
      let bannerUrl = store.banner_url || null
      if (logoFile) logoUrl = await uploadAsset(logoFile, 'logo', session.user.id)
      if (bannerFile) bannerUrl = await uploadAsset(bannerFile, 'banner', session.user.id)
      const payload = {
        name: name.trim(), whatsapp: whatsapp.trim(), description: description.trim() || null,
        address_line: address.trim() || null, city: city.trim() || null, state: stateCode.trim().toUpperCase().slice(0,2) || null,
        slug: cleanSlug, primary_color: primaryColor, is_open: isOpen, age_restricted_sales: ageRestricted,
        opening_hours: hours, logo_url: logoUrl, banner_url: bannerUrl,
      }
      const { data, error: updateError } = await supabase.from('stores').update(payload).eq('id', store.id).select('*').single()
      if (updateError || !data) throw updateError || new Error('Não foi possível salvar a loja.')
      setStore(data); setSlug(data.slug); setLogoPreview(data.logo_url || ''); setBannerPreview(data.banner_url || '')
      setLogoFile(null); setBannerFile(null); setSuccess('Loja atualizada com sucesso.')
    } catch (err:any) { setError(err?.message || 'Não foi possível salvar as alterações.') }
    setSaving(false)
  }

  if (loading) return <div className="ownerPage"><PageHeader title="Minha loja" description="Carregando dados da loja..."/></div>

  return <div className="ownerPage">
    <PageHeader title="Minha loja" description="Personalize como sua loja aparece para os clientes." action={store ? <Link className="button secondary" to={`/loja/${store.slug}`}><Eye size={17}/> Ver loja</Link> : undefined}/>
    {error && <div className="infoAlert" style={{marginBottom:16,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}><span>{error}</span>{authExpired && <button type="button" className="button secondary" onClick={()=>window.open(`${window.location.origin}${window.location.pathname}#/entrar`,'pedevo-login')}>Entrar novamente</button>}</div>}
    {success && <div className="successAlert" style={{marginBottom:16}}>{success}</div>}
    <form onSubmit={saveStore}>
      <section className="panelCard">
        <div className="panelTitle"><div><h2>Marca e aparência</h2><p>Logo, banner e cor que aparecem na página pública.</p></div></div>
        <div className="imageGuideBox">
          <strong>Guia de imagens para criar por IA</strong>
          <span>Use estes tamanhos para evitar cortes e manter boa qualidade no celular e no computador.</span>
          <div className="imageGuideGrid">
            <div><b>Logo</b><strong>1024 × 1024 px</strong><small>1:1 · PNG/WebP · fundo transparente recomendado</small></div>
            <div><b>Banner</b><strong>1600 × 600 px</strong><small>8:3 · JPG/WebP · mantenha textos e logo no centro</small></div>
            <div><b>Produtos</b><strong>1200 × 1200 px</strong><small>1:1 · JPG/PNG/WebP · produto centralizado</small></div>
          </div>
        </div>
        <div className="storeAssetsGrid">
          <label className="assetUploader logoAsset"><span>Logo da loja</span><div className="assetPreview logo">{logoPreview ? <img src={logoPreview} alt="Logo da loja"/> : <b>{name.split(' ').slice(0,2).map((w)=>w[0]).join('').toUpperCase() || 'PL'}</b>}</div><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>pickImage(e.target.files?.[0] || null,'logo')}/><small><b>1024 × 1024 px</b> · quadrada (1:1) · PNG ou WebP recomendado · até 5 MB</small></label>
          <label className="assetUploader bannerAsset"><span>Banner da loja</span><div className="assetPreview banner">{bannerPreview ? <img src={bannerPreview} alt="Banner da loja"/> : <div><b>Seu banner aqui</b><small>Imagem horizontal para destacar sua marca</small></div>}</div><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>pickImage(e.target.files?.[0] || null,'banner')}/><small><b>1600 × 600 px</b> · horizontal (8:3) · JPG ou WebP recomendado · até 5 MB</small></label>
        </div>
        <div className="formGrid two"><label>Nome da loja<input value={name} onChange={(e)=>setName(e.target.value)} required/></label><label>WhatsApp<input value={whatsapp} onChange={(e)=>setWhatsapp(e.target.value)} placeholder="(63) 99999-9999"/></label></div>
        <label>Descrição<textarea rows={3} value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Conte aos clientes o que sua loja oferece."/></label>
        <div className="formGrid two"><label>Cor principal<div className="colorField"><input type="color" value={primaryColor} onChange={(e)=>setPrimaryColor(e.target.value)}/><input value={primaryColor} onChange={(e)=>setPrimaryColor(e.target.value)} maxLength={7}/></div></label><label>URL da loja<div className="slugField"><span>/loja/</span><input value={slug} onChange={(e)=>setSlug(normalizeSlug(e.target.value))}/></div></label></div>
      </section>

      <section className="panelCard">
        <div className="panelTitle"><div><h2>Contato, endereço e área de atuação</h2><p>A cidade e o estado também definem onde o delivery pode receber pedidos.</p></div></div>
        <label>Rua / endereço<input value={address} onChange={(e)=>setAddress(e.target.value)} placeholder="Rua, número e bairro"/></label>
        <div className="formGrid two"><label>Cidade<input value={city} onChange={(e)=>setCity(e.target.value)} placeholder="Araguaína"/></label><label>Estado / UF<input value={stateCode} onChange={(e)=>setStateCode(e.target.value.toUpperCase().slice(0,2))} placeholder="TO" maxLength={2}/></label></div><div className="serviceAreaOwnerNotice"><strong>Área de atuação do delivery</strong><span>O checkout aceitará CEPs desta cidade/UF e preencherá rua, bairro e cidade automaticamente. O cliente poderá corrigir os dados quando necessário.</span></div>
      </section>

      <section className="panelCard">
        <div className="settingsSection"><div><h2>Loja aberta</h2><p>Quando desligado, o cardápio continua visível, mas informa que a loja está fechada.</p></div><label className="switch"><input type="checkbox" checked={isOpen} onChange={(e)=>setIsOpen(e.target.checked)}/><i></i></label></div>
        <div className="settingsSection"><div><h2>Venda de bebidas alcoólicas</h2><p>Exibe aviso 18+ e pede confirmação de maioridade no checkout.</p></div><label className="switch"><input type="checkbox" checked={ageRestricted} onChange={(e)=>setAgeRestricted(e.target.checked)}/><i></i></label></div>
      </section>

      <section className="panelCard">
        <div className="panelTitle"><div><h2>Horários de funcionamento</h2><p>Informe os horários para seus clientes saberem quando a loja atende.</p></div></div>
        <div className="storeSchedule">{dayList.map(({key,label})=>{ const value=hours[key] || {enabled:false,open:'08:00',close:'18:00'}; return <div className="scheduleRow" key={String(key)}><strong>{label}</strong><label className="switch compactSwitch"><input type="checkbox" checked={Boolean(value.enabled)} onChange={(e)=>updateHour(key,{enabled:e.target.checked})}/><i></i></label>{value.enabled ? <><input type="time" value={value.open} onChange={(e)=>updateHour(key,{open:e.target.value})}/><span>até</span><input type="time" value={value.close} onChange={(e)=>updateHour(key,{close:e.target.value})}/></> : <em>Fechado</em>}</div>})}</div>
      </section>

      <div className="storeSaveBar"><div><strong>{isOpen ? 'Loja aberta' : 'Loja fechada'}</strong><span>As alterações aparecem na página pública assim que você salvar.</span></div><button className="button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar minha loja'}</button></div>
    </form>
  </div>
}

function MessageTemplatesSettings({ storeId }: { storeId: string }) {
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [deleting, setDeleting] = useState<any>(null)

  async function loadTemplates() {
    if (!supabase) return
    setLoading(true)
    const { data, error: loadError } = await supabase.from('store_message_templates').select('*').eq('store_id', storeId).order('sort_order').order('created_at')
    if (loadError) setError(loadError.message)
    else setTemplates(data || [])
    setLoading(false)
  }

  useEffect(() => { loadTemplates() }, [storeId])

  function openNew() { setEditing(null); setModal(true); setError(''); setSuccess('') }
  function openEdit(item: any) { setEditing(item); setModal(true); setError(''); setSuccess('') }

  async function saveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setSaving(true); setError(''); setSuccess('')
    const form = new FormData(event.currentTarget)
    const payload = {
      store_id: storeId,
      name: String(form.get('name') || '').trim(),
      message: String(form.get('message') || '').trim(),
      active: form.get('active') === 'on',
      sort_order: Number(form.get('sort_order') || 0),
    }
    const result = editing
      ? await supabase.from('store_message_templates').update(payload).eq('id', editing.id).select('*').single()
      : await supabase.from('store_message_templates').insert(payload).select('*').single()
    if (result.error || !result.data) setError(result.error?.message || 'Não foi possível salvar a mensagem.')
    else {
      setTemplates((current) => editing ? current.map((item) => item.id === editing.id ? result.data : item).sort((a,b)=>a.sort_order-b.sort_order) : [...current, result.data].sort((a,b)=>a.sort_order-b.sort_order))
      setModal(false); setEditing(null); setSuccess('Mensagem salva.')
    }
    setSaving(false)
  }

  async function deleteTemplate() {
    if (!supabase || !deleting) return
    setSaving(true); setError('')
    const { error: deleteError } = await supabase.from('store_message_templates').delete().eq('id', deleting.id)
    if (deleteError) setError(deleteError.message)
    else { setTemplates((current)=>current.filter((item)=>item.id!==deleting.id)); setDeleting(null); setSuccess('Mensagem excluída.') }
    setSaving(false)
  }

  return <section className="panelCard messageTemplateSettings">
    <div className="panelTitle"><div><h2>Mensagens rápidas para clientes</h2><p>Crie textos que aparecem como botões dentro de cada pedido. O WhatsApp abre com a mensagem pronta.</p></div><button className="button secondary" onClick={openNew}><Plus size={16}/> Nova mensagem</button></div>
    <div className="templateVariableHelp"><strong>Campos automáticos:</strong><span>{'{cliente}'} · {'{pedido}'} · {'{loja}'} · {'{total}'} · {'{pagamento}'} · {'{recebimento}'} · {'{endereco}'}</span></div>
    {error && <div className="infoAlert">{error}</div>}{success && <div className="successAlert">{success}</div>}
    {loading ? <p className="orderMuted">Carregando mensagens...</p> : templates.length === 0 ? <div className="deliveryEmpty"><MessageCircle/><div><strong>Nenhuma mensagem criada</strong><span>Crie mensagens como “Pagamento confirmado” ou “Saiu para entrega”.</span></div></div> : <div className="messageTemplateList">{templates.map((item)=><div key={item.id}><MessageCircle size={18}/><div><strong>{item.name}</strong><small>{item.message}</small></div><span className={item.active ? 'activePill' : 'inactivePill'}>{item.active ? 'Ativa' : 'Oculta'}</span><div className="categoryActions"><button className="miniButton" onClick={()=>openEdit(item)}><Pencil size={14}/> Editar</button><button className="miniButton dangerMiniButton" onClick={()=>setDeleting(item)}><Trash2 size={14}/> Excluir</button></div></div>)}</div>}
    {modal && <div className="modalBackdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setModal(false)}}><div className="modalCard messageTemplateModal"><div className="modalTitle"><div><h2>{editing ? 'Editar mensagem' : 'Nova mensagem'}</h2><p>O lojista poderá usar esta mensagem em qualquer pedido.</p></div><button onClick={()=>setModal(false)}>×</button></div><form onSubmit={saveTemplate}><label>Nome do botão<input name="name" required maxLength={60} defaultValue={editing?.name || ''} placeholder="Ex.: Pagamento confirmado"/></label><label>Mensagem<textarea name="message" required rows={6} defaultValue={editing?.message || ''} placeholder="Olá, {cliente}! Seu pedido #{pedido} da {loja}..."/></label><div className="formGrid two"><label>Ordem<input name="sort_order" type="number" min="0" defaultValue={editing?.sort_order ?? templates.length}/></label><label className="checkLine"><input name="active" type="checkbox" defaultChecked={editing ? Boolean(editing.active) : true}/> Mostrar nos pedidos</label></div><button className="button full large" disabled={saving}>{saving ? 'Salvando...' : 'Salvar mensagem'}</button></form></div></div>}
    {deleting && <div className="modalBackdrop"><div className="modalCard confirmDeleteModal"><div className="deleteIcon"><Trash2 size={26}/></div><h2>Excluir “{deleting.name}”?</h2><p>Ela deixará de aparecer nos pedidos. Você poderá criar outra mensagem quando quiser.</p><div className="confirmDeleteActions"><button className="button secondary" onClick={()=>setDeleting(null)}>Cancelar</button><button className="button dangerButton" onClick={deleteTemplate} disabled={saving}>{saving ? 'Excluindo...' : 'Excluir mensagem'}</button></div></div></div>}
  </section>
}


function OrderAlertSettings({ store, onSaved }: { store: any; onSaved: (next: any) => void }) {
  const [soundEnabled, setSoundEnabled] = useState(store?.new_order_sound_enabled !== false)
  const [flashEnabled, setFlashEnabled] = useState(store?.new_order_flash_enabled !== false)
  const [previewFlash, setPreviewFlash] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setSoundEnabled(store?.new_order_sound_enabled !== false)
    setFlashEnabled(store?.new_order_flash_enabled !== false)
  }, [store?.id, store?.new_order_sound_enabled, store?.new_order_flash_enabled])

  async function saveAlerts() {
    if (!supabase || !store?.id) return
    setSaving(true); setError(''); setSuccess('')
    const { data, error: updateError } = await supabase
      .from('stores')
      .update({ new_order_sound_enabled: soundEnabled, new_order_flash_enabled: flashEnabled })
      .eq('id', store.id)
      .select('*')
      .single()
    if (updateError) setError(updateError.message)
    else { onSaved(data); setSuccess('Alertas de novos pedidos atualizados.') }
    setSaving(false)
  }

  function testFlash() {
    setPreviewFlash(true)
    window.setTimeout(() => setPreviewFlash(false), 3500)
  }

  return <section className="panelCard orderAlertSettings">
    <div className="panelTitle"><div><h2>Alertas de novos pedidos</h2><p>Escolha como o painel avisa quando chegar um pedido novo.</p></div><span className="securityRecommended"><BellRing size={16}/> Tempo real</span></div>
    {error && <div className="infoAlert">{error}</div>}{success && <div className="successAlert">{success}</div>}
    <div className="alertPreferenceGrid">
      <div className="alertPreferenceCard"><div className="alertPreferenceIcon">{soundEnabled ? <Volume2/> : <VolumeX/>}</div><div><strong>Som de novo pedido</strong><span>Toca um aviso curto quando um pedido entrar no painel.</span><small>O navegador pode exigir uma primeira interação antes de permitir sons automáticos.</small></div><label className="switch"><input type="checkbox" checked={soundEnabled} onChange={(e)=>setSoundEnabled(e.target.checked)}/><i></i></label></div>
      <div className="alertPreferenceCard"><div className="alertPreferenceIcon"><BellRing/></div><div><strong>Destacar e piscar pedido novo</strong><span>O pedido recém-chegado fica destacado por 30 segundos na visão geral.</span><small>Também aparece um aviso com botão “Ver pedido”.</small></div><label className="switch"><input type="checkbox" checked={flashEnabled} onChange={(e)=>setFlashEnabled(e.target.checked)}/><i></i></label></div>
    </div>
    <div className={`newOrderPreview ${previewFlash ? 'pulse' : ''}`}><BellRing/><div><strong>Exemplo: novo pedido #123</strong><span>Cliente teste · R$ 35,00</span></div></div>
    <div className="alertPreferenceActions"><button className="button secondary" type="button" onClick={playNewOrderSound}><Volume2 size={16}/> Testar som</button><button className="button secondary" type="button" onClick={testFlash}><BellRing size={16}/> Testar animação</button><button className="button" type="button" disabled={saving} onClick={saveAlerts}>{saving ? 'Salvando...' : 'Salvar alertas'}</button></div>
  </section>
}

function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [store, setStore] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
      const [{ data: ownedStore, error: storeError }, userResult] = await Promise.all([getOwnedStore(), supabase.auth.getUser()])
      if (!mounted) return
      if (storeError || !ownedStore) { setError(storeError?.message || 'Loja não encontrada.'); setLoading(false); return }
      setStore(ownedStore)
      setEmail(userResult.data.user?.email || '')
      const subResult = await supabase.from('subscriptions').select('*').eq('store_id', ownedStore.id).maybeSingle()
      if (!mounted) return
      if (subResult.error) setError(subResult.error.message)
      else setSubscription(subResult.data || null)
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  if (loading) return <div className="ownerPage"><PageHeader title="Configurações" description="Carregando sua conta e assinatura..."/></div>
  const meta = subscriptionMeta(subscription)
  const trialDays = subscription?.status === 'trial' ? daysRemaining(subscription.included_until) : 0
  const totalTrialDays = Number(subscription?.included_days || 60)
  const progress = subscription?.status === 'trial' ? Math.max(0, Math.min(100, Math.round((trialDays / totalTrialDays) * 100))) : 0

  return <div className="ownerPage"><PageHeader title="Configurações" description="Sua conta, atalhos e situação da assinatura Pedevo."/>
    {error && <div className="infoAlert" style={{marginBottom:16}}>{error}</div>}
    <section className="panelCard">
      <div className="panelTitle"><div><h2>Sua conta</h2><p>Dados de acesso ao painel do lojista.</p></div></div>
      <div className="accountInfoGrid"><div><span>E-mail</span><strong>{email || 'Não informado'}</strong></div><div><span>Loja</span><strong>{store?.name || '—'}</strong></div><div><span>Endereço público</span><strong>/loja/{store?.slug || '—'}</strong></div></div>
    </section>

    <SecuritySettings />

    {store && <OrderAlertSettings store={store} onSaved={setStore}/>}

<section className="panelCard subscriptionPanel">
      <div className="panelTitle"><div><h2>Assinatura</h2><p>Plano comercial da sua loja no Pedevo.</p></div><span className={`subscriptionStatus ${meta.tone}`}>{meta.label}</span></div>
      <div className="subscriptionHero">
        <div><span>Plano atual</span><strong>{subscription?.plan_name || 'Pedevo Essencial'}</strong><small>Ativação {formatBRL(Number(subscription?.signup_fee || 0))} • {subscription?.included_days || 0} dia(s) de acesso inicial • renovação {formatBRL(Number(subscription?.monthly_price || 0))} a cada {subscription?.renewal_months || 1} mês(es)</small></div>
        <div className={`subscriptionAccess ${meta.canOrder ? 'ok' : 'paused'}`}><ShieldCheck size={18}/><span>{meta.canOrder ? 'Pedidos liberados' : 'Pedidos pausados'}</span></div>
      </div>
      {subscription?.status === 'trial' && <div className="trialProgress"><div><span>Período inicial</span><strong>{trialDays} dia(s) restante(s)</strong></div><div className="trialProgressTrack"><i style={{width:`${progress}%`}}></i></div><small>Válido até {dateBR(subscription.included_until)}.</small></div>}
      {subscription?.status === 'pending' && <div className="subscriptionActionNote"><AlertTriangle size={18}/><div><strong>Ativação pendente</strong><span>Após a confirmação do pagamento inicial de {formatBRL(Number(subscription.signup_fee || 0))}, o acesso do plano {subscription.plan_name || 'Pedevo'} começa a contar.</span></div></div>}
      {['overdue','blocked'].includes(subscription?.status) && <div className="subscriptionActionNote danger"><AlertTriangle size={18}/><div><strong>Regularização necessária</strong><span>{meta.detail} Seus dados continuam salvos no Pedevo.</span></div></div>}
      {subscription?.status === 'active' && <div className="subscriptionDates"><div><span>Último pagamento</span><strong>{dateBR(subscription.last_payment_at)}</strong></div><div><span>Próxima cobrança</span><strong>{dateBR(subscription.current_period_end || subscription.next_charge_at)}</strong></div></div>}
      <p className="subscriptionFootnote">O plano e os valores são definidos pela administração do Pedevo. Alterações comerciais futuras não mudam retroativamente um período já pago; passam a valer conforme a configuração aplicada à assinatura.</p>
    </section>

    {store && <MessageTemplatesSettings storeId={store.id}/>}

    <section className="panelCard">
      <div className="panelTitle"><div><h2>Atalhos de configuração</h2><p>As configurações reais da loja ficam nestas áreas.</p></div></div>
      <div className="settingsLinks"><Link to="/painel/minha-loja"><Store size={18}/><div><strong>Minha loja</strong><span>Nome, logo, banner, endereço e horários</span></div></Link><Link to="/painel/entregas"><Bike size={18}/><div><strong>Entregas</strong><span>Bairros, taxas e pedido mínimo</span></div></Link><Link to="/painel/pagamentos"><CreditCard size={18}/><div><strong>Pagamentos</strong><span>Pix, dinheiro e cartão</span></div></Link></div>
    </section>
  </div>
}

