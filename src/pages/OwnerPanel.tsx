import { BarChart3, Bike, Box, CheckCircle2, Clock3, CreditCard, DollarSign, Eye, MapPin, Package, Plus, Search, Settings, ShoppingBag, Store, Tags, Users, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import OwnerShell from '../components/OwnerShell'
import StatCard from '../components/StatCard'
import { demoCategories, demoOrders, demoProducts, demoStore } from '../data/demo'
import { formatBRL, statusLabel } from '../lib/format'
import type { Product } from '../types'

function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="ownerPageHeader"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>
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

function DashboardHome() {
  return <div className="ownerPage"><PageHeader title="Bom dia 👋" description="Aqui está o resumo do Depósito Central hoje." action={<Link className="button secondary" to="/loja/deposito-central"><Eye size={18}/> Ver minha loja</Link>}/>
    <div className="ownerStats"><StatCard label="Pedidos hoje" value="12" helper="+20% vs. ontem" icon={ShoppingBag}/><StatCard label="Vendas hoje" value="R$ 450,20" helper="Ticket médio R$ 37,52" icon={DollarSign}/><StatCard label="Clientes" value="85" helper="8 novos esta semana" icon={Users}/><StatCard label="Produtos ativos" value="42" helper="3 com estoque baixo" icon={Box}/></div>
    <div className="ownerDashboardGrid">
      <section className="panelCard"><div className="panelTitle"><div><h2>Pedidos recentes</h2><p>Acompanhe o andamento dos últimos pedidos.</p></div><Link to="/painel/pedidos">Ver todos</Link></div><OrdersTable compact/></section>
      <section className="panelCard"><div className="panelTitle"><div><h2>Ações rápidas</h2><p>Atalhos para tarefas frequentes.</p></div></div><div className="quickActions"><Link to="/painel/produtos"><Plus/><span><strong>Novo produto</strong><small>Cadastre item e preço</small></span></Link><Link to="/painel/entregas"><Bike/><span><strong>Taxas de entrega</strong><small>Configure bairros</small></span></Link><Link to="/painel/minha-loja"><Store/><span><strong>Editar loja</strong><small>Dados e aparência</small></span></Link><Link to="/painel/pagamentos"><CreditCard/><span><strong>Pagamentos</strong><small>Pix e formas aceitas</small></span></Link></div></section>
    </div>
    <section className="panelCard"><div className="panelTitle"><div><h2>Resumo dos últimos 7 dias</h2><p>Demonstração visual do painel.</p></div></div><div className="fakeChart"><div style={{height:'32%'}}></div><div style={{height:'55%'}}></div><div style={{height:'44%'}}></div><div style={{height:'68%'}}></div><div style={{height:'61%'}}></div><div style={{height:'83%'}}></div><div style={{height:'94%'}}></div></div><div className="chartLabels"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div></section>
  </div>
}

function OrdersTable({ compact = false }: { compact?: boolean }) {
  const rows = compact ? demoOrders.slice(0, 4) : demoOrders
  return <div className="tableWrap"><table className="dataTable"><thead><tr><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Total</th><th>Status</th><th>Hora</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td><strong>{order.id}</strong></td><td>{order.customer}</td><td>{order.type === 'delivery' ? 'Delivery' : 'Retirada'}</td><td>{formatBRL(order.total)}</td><td><span className={`orderStatus ${order.status}`}>{statusLabel[order.status]}</span></td><td>{order.createdAt}</td></tr>)}</tbody></table></div>
}

function Orders() {
  const [filter, setFilter] = useState('todos')
  const filtered = filter === 'todos' ? demoOrders : demoOrders.filter((order) => order.status === filter)
  return <div className="ownerPage"><PageHeader title="Pedidos" description="Receba e acompanhe todos os pedidos da sua loja."/>
    <div className="filterTabs">{[['todos','Todos'],['pending','Novos'],['preparing','Preparando'],['out_for_delivery','Em entrega'],['completed','Finalizados']].map(([value,label]) => <button key={value} onClick={()=>setFilter(value)} className={filter===value?'active':''}>{label}</button>)}</div>
    <section className="panelCard"><OrdersTableRows rows={filtered}/></section>
  </div>
}

function OrdersTableRows({ rows }: { rows: typeof demoOrders }) {
  return <div className="tableWrap"><table className="dataTable"><thead><tr><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Total</th><th>Status</th><th>Ação</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td><strong>{order.id}</strong><small>{order.createdAt}</small></td><td>{order.customer}</td><td>{order.type === 'delivery' ? 'Delivery' : 'Retirada'}</td><td>{formatBRL(order.total)}</td><td><span className={`orderStatus ${order.status}`}>{statusLabel[order.status]}</span></td><td><button className="miniButton">Abrir</button></td></tr>)}</tbody></table></div>
}

function Products() {
  const [products, setProducts] = useState<Product[]>(demoProducts)
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(false)
  const visible = useMemo(()=>products.filter(p=>p.name.toLowerCase().includes(query.toLowerCase())),[products,query])
  function addProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget)
    const product: Product = {id:`local-${Date.now()}`,name:String(f.get('name')),description:String(f.get('description')),price:Number(String(f.get('price')).replace(',','.'))||0,categoryId:String(f.get('category')),emoji:'📦',active:true,unitLabel:String(f.get('unit')),stock:Number(f.get('stock'))||null,requiresAge18:f.get('age18')==='on'}
    setProducts([product,...products]); setModal(false)
  }
  return <div className="ownerPage"><PageHeader title="Produtos" description="Cadastre e organize os itens disponíveis na sua loja." action={<button className="button" onClick={()=>setModal(true)}><Plus size={18}/> Adicionar produto</button>}/>
    <div className="ownerToolbar"><label className="searchBox"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar produto..."/></label><span>{visible.length} produtos</span></div>
    <section className="panelCard productAdminGrid">{visible.map(p=><article className="adminProduct" key={p.id}><div className="adminProductVisual">{p.emoji}</div><div><strong>{p.name}</strong><span>{demoCategories.find(c=>c.id===p.categoryId)?.name || 'Sem categoria'}</span><b>{formatBRL(p.price)}</b><small>{p.stock===null?'Estoque não controlado':`${p.stock} em estoque`} {p.requiresAge18?'• 18+':''}</small></div><label className="switch"><input type="checkbox" checked={p.active} onChange={()=>setProducts(products.map(item=>item.id===p.id?{...item,active:!item.active}:item))}/><i></i></label></article>)}</section>
    {modal && <div className="modalBackdrop"><div className="modalCard"><div className="modalTitle"><div><h2>Novo produto</h2><p>Preencha os dados básicos do produto.</p></div><button onClick={()=>setModal(false)}>×</button></div><form onSubmit={addProduct}><label>Nome<input name="name" required placeholder="Ex.: Cerveja Pilsen 350ml"/></label><label>Descrição<textarea name="description" rows={3} placeholder="Descrição curta"/></label><div className="formGrid two"><label>Preço<input name="price" required inputMode="decimal" placeholder="3,49"/></label><label>Unidade<select name="unit"><option value="unidade">Unidade</option><option value="pack">Pack</option><option value="fardo">Fardo</option><option value="caixa">Caixa</option><option value="kg">Kg</option></select></label></div><div className="formGrid two"><label>Categoria<select name="category">{demoCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Estoque<input name="stock" type="number" min="0" placeholder="Opcional"/></label></div><label className="checkLine"><input type="checkbox" name="age18"/> Produto com venda exclusiva para maiores de 18 anos</label><button className="button full large">Cadastrar produto</button></form></div></div>}
  </div>
}

function Categories() {
  return <div className="ownerPage"><PageHeader title="Categorias" description="Organize seus produtos para o cliente encontrar mais rápido." action={<button className="button"><Plus size={18}/> Nova categoria</button>}/><section className="panelCard"><div className="categoryAdminList">{demoCategories.map((c,i)=><div key={c.id}><span className="dragHandle">⋮⋮</span><b>{c.icon}</b><div><strong>{c.name}</strong><small>{demoProducts.filter(p=>p.categoryId===c.id).length} produtos</small></div><span className="activePill">Ativa</span><button className="miniButton">Editar</button></div>)}</div></section></div>
}

function Delivery() {
  const [delivery,setDelivery]=useState(true)
  return <div className="ownerPage"><PageHeader title="Entregas" description="Configure como sua loja atende cada região."/><section className="panelCard"><div className="settingsSection"><div><h2>Delivery</h2><p>Permitir que clientes façam pedidos para entrega.</p></div><label className="switch"><input checked={delivery} type="checkbox" onChange={e=>setDelivery(e.target.checked)}/><i></i></label></div><div className="formGrid three"><label>Pedido mínimo<input defaultValue="15,00"/></label><label>Tempo médio<input defaultValue="30 - 50 min"/></label><label>Taxa padrão<input defaultValue="6,00"/></label></div></section><section className="panelCard"><div className="panelTitle"><div><h2>Bairros e taxas</h2><p>Você pode cobrar valores diferentes por região.</p></div><button className="button secondary"><Plus size={17}/> Adicionar bairro</button></div><div className="neighborhoodList">{[['Centro','R$ 5,00','25-40 min'],['Setor Aeroporto','R$ 6,00','30-45 min'],['Jardim das Flores','R$ 8,00','35-50 min']].map(x=><div key={x[0]}><MapPin/><div><strong>{x[0]}</strong><small>{x[2]}</small></div><b>{x[1]}</b><button className="miniButton">Editar</button></div>)}</div></section></div>
}

function Payments() {
  return <div className="ownerPage"><PageHeader title="Pagamentos" description="Escolha as formas de pagamento aceitas pela loja."/><section className="panelCard"><div className="paymentSetting"><span>◈</span><div><strong>Pix</strong><p>Mostre sua chave ao cliente e confirme o pagamento manualmente neste MVP.</p></div><label className="switch"><input type="checkbox" defaultChecked/><i></i></label></div><label>Chave Pix<input placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"/></label></section><section className="panelCard"><div className="paymentSetting"><span>💵</span><div><strong>Dinheiro</strong><p>Cliente informa se precisa de troco.</p></div><label className="switch"><input type="checkbox" defaultChecked/><i></i></label></div><div className="paymentSetting"><span>💳</span><div><strong>Cartão na entrega</strong><p>Pagamento na maquininha do estabelecimento ou entregador.</p></div><label className="switch"><input type="checkbox" defaultChecked/><i></i></label></div></section><div className="infoAlert">Pagamento online e cobrança automática de assinatura serão integrados em uma próxima etapa, usando backend seguro. Chaves secretas nunca devem ficar no código do GitHub Pages.</div></div>
}

function Reports() {
  return <div className="ownerPage"><PageHeader title="Relatórios" description="Veja como sua loja está vendendo."/><div className="ownerStats"><StatCard label="Vendas no mês" value="R$ 8.420,50" helper="+14,2%" icon={DollarSign}/><StatCard label="Pedidos" value="226" helper="Ticket médio R$ 37,26" icon={ShoppingBag}/><StatCard label="Novos clientes" value="41" helper="18% do total" icon={Users}/><StatCard label="Taxa de conclusão" value="94,7%" helper="12 cancelados" icon={CheckCircle2}/></div><section className="panelCard"><div className="panelTitle"><div><h2>Produtos mais vendidos</h2><p>Ranking demonstrativo.</p></div></div><div className="rankList">{demoProducts.slice(0,5).map((p,i)=><div key={p.id}><span>{i+1}</span><b>{p.emoji}</b><div><strong>{p.name}</strong><small>{38-i*5} vendas</small></div><em>{formatBRL((38-i*5)*p.price)}</em></div>)}</div></section></div>
}

function MyStore() {
  return <div className="ownerPage"><PageHeader title="Minha loja" description="Edite os dados que aparecem para seus clientes." action={<Link className="button secondary" to="/loja/deposito-central"><Eye size={17}/> Ver loja</Link>}/><section className="panelCard"><div className="storeEditHeader"><div className="storeEditLogo">DC</div><div><h2>{demoStore.name}</h2><p>pedevo.app/{demoStore.slug}</p><button className="miniButton">Trocar logo</button></div></div><div className="formGrid two"><label>Nome da loja<input defaultValue={demoStore.name}/></label><label>WhatsApp<input defaultValue="(63) 99999-9999"/></label></div><label>Descrição<textarea rows={3} defaultValue={demoStore.description}/></label><label>Endereço<input defaultValue={demoStore.address}/></label><div className="formGrid two"><label>Cor principal<input type="color" defaultValue={demoStore.primaryColor}/></label><label>URL da loja<input defaultValue={demoStore.slug}/></label></div><button className="button">Salvar alterações</button></section><section className="panelCard"><div className="settingsSection"><div><h2>Venda de bebidas alcoólicas</h2><p>Exibe aviso 18+ e pede confirmação de maioridade no checkout.</p></div><label className="switch"><input type="checkbox" defaultChecked/><i></i></label></div></section></div>
}

function SettingsPage() {
  return <div className="ownerPage"><PageHeader title="Configurações" description="Preferências gerais do estabelecimento."/><section className="panelCard"><h2>Funcionamento</h2><div className="settingsSection"><div><strong>Loja aberta</strong><p>Permite novos pedidos agora.</p></div><label className="switch"><input type="checkbox" defaultChecked/><i></i></label></div><div className="settingsSection"><div><strong>Retirada na loja</strong><p>Cliente pode buscar o pedido no balcão.</p></div><label className="switch"><input type="checkbox" defaultChecked/><i></i></label></div></section><section className="panelCard"><h2>Assinatura</h2><div className="subscriptionBox"><div><span>Plano lançamento</span><strong>60 dias incluídos</strong><small>Depois R$ 19,90/mês</small></div><span className="activePill">Período inicial</span></div></section></div>
}
