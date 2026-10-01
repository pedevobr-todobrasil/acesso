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
import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import Brand from './Brand'
import { getOwnedStore } from '../lib/pedevoApi'
import { supabase } from '../lib/supabase'

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
  const [storeName, setStoreName] = useState('Minha loja')
  const navigate = useNavigate()

  useEffect(() => {
    getOwnedStore().then(({ data }) => {
      if (data?.name) setStoreName(data.name)
    })
  }, [])

  async function logout(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (supabase) await supabase.auth.signOut()
    navigate('/entrar')
  }

  return (
    <aside className="ownerSidebar">
      <NavLink to="/" className="sidebarBrand"><Brand compact /></NavLink>
      <div className="ownerStoreBadge">
        <span>Loja ativa</span>
        <strong>{storeName}</strong>
      </div>
      <nav className="ownerMenu">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={18} /> <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <NavLink to="/entrar" onClick={logout} className="logoutLink"><LogOut size={18} /> Sair</NavLink>
    </aside>
  )
}
