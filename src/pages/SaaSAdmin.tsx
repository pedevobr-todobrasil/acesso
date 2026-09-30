import { AlertTriangle, Building2, DollarSign, Search, ShieldCheck, Store, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Brand from '../components/Brand'
import StatCard from '../components/StatCard'

const clients = [
  {name:'Depósito Central',segment:'Depósito de bebidas',owner:'João',plan:'60 dias',status:'trial',value:'R$ 0,00'},
  {name:'Burger House',segment:'Hamburgueria',owner:'Marcos',plan:'Mensal',status:'active',value:'R$ 19,90'},
  {name:'Pastel do Centro',segment:'Pastelaria',owner:'Ana',plan:'Mensal',status:'active',value:'R$ 19,90'},
  {name:'Doces da Mari',segment:'Doceria',owner:'Mariana',plan:'Mensal',status:'overdue',value:'R$ 19,90'},
]

export default function SaaSAdmin() {
  const [query,setQuery]=useState('')
  const filtered=clients.filter(c=>`${c.name} ${c.segment} ${c.owner}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="adminPage"><aside className="adminSidebar"><Link to="/"><Brand compact/></Link><span className="adminTag"><ShieldCheck size={14}/> Administração</span><nav><a className="active"><Store/> Visão geral</a><a><Building2/> Lojas</a><a><Users/> Assinantes</a><a><DollarSign/> Financeiro</a></nav><Link to="/painel" className="adminBack">Abrir painel de loja</Link></aside><main className="adminMain"><div className="ownerPageHeader"><div><h1>Administração Pedevo</h1><p>Controle geral do SaaS, clientes e assinaturas.</p></div><span className="demoPill">Ambiente demonstrativo</span></div><div className="ownerStats"><StatCard label="Lojas cadastradas" value="287" helper="+18 este mês" icon={Building2}/><StatCard label="Assinantes ativos" value="231" helper="80,5% da base" icon={Users}/><StatCard label="MRR estimado" value="R$ 4.596,90" helper="Após os períodos iniciais" icon={DollarSign}/><StatCard label="Pendências" value="14" helper="Cobranças a revisar" icon={AlertTriangle}/></div><section className="panelCard"><div className="panelTitle"><div><h2>Clientes</h2><p>Acompanhe o status das lojas cadastradas.</p></div><label className="searchBox adminSearch"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar cliente..."/></label></div><div className="tableWrap"><table className="dataTable"><thead><tr><th>Loja</th><th>Segmento</th><th>Responsável</th><th>Plano</th><th>Mensalidade</th><th>Status</th><th>Ação</th></tr></thead><tbody>{filtered.map(c=><tr key={c.name}><td><strong>{c.name}</strong></td><td>{c.segment}</td><td>{c.owner}</td><td>{c.plan}</td><td>{c.value}</td><td><span className={`subscriptionStatus ${c.status}`}>{c.status==='trial'?'60 dias':c.status==='active'?'Ativo':'Pendente'}</span></td><td><button className="miniButton">Detalhes</button></td></tr>)}</tbody></table></div></section><div className="infoAlert">O painel master real deve ser protegido por autenticação e permissões administrativas no Supabase. A chave <strong>service_role</strong> nunca deve ser enviada para o navegador.</div></main></div>
}
