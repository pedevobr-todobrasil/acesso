import {
  BarChart3,
  Bike,
  Box,
  ClipboardList,
  CreditCard,
  Home,
  LogOut,
  Settings,
  Store,
  Tags,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import Brand from './Brand'

const links = [
  { to: '/painel', label: 'Visão geral', icon: Home, end: true },
  { to: '/painel/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/painel/produtos', label: 'Produtos', icon: Box },
  { to: '/painel/categorias', label: 'Categorias', icon: Tags },
  { to: '/painel/entregas', label: 'Entregas', icon: Bike },
  { to: '/painel/pagamentos', label: 'Pagamentos', icon: CreditCard },
  { to: '/painel/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/painel/minha-loja', label: 'Minha loja', icon: Store },
  { to: '/painel/configuracoes', label: 'Configurações', icon: Settings },
]

export default function OwnerSidebar() {
  return (
    <aside className="ownerSidebar">
      <NavLink to="/" className="sidebarBrand"><Brand compact /></NavLink>
      <div className="ownerStoreBadge">
        <span>Loja ativa</span>
        <strong>Depósito Central</strong>
      </div>
      <nav className="ownerMenu">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={18} /> <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <NavLink to="/entrar" className="logoutLink"><LogOut size={18} /> Sair</NavLink>
    </aside>
  )
}
