import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import Brand from './Brand'

export default function PublicHeader() {
  const [open, setOpen] = useState(false)
  return (
    <header className="publicHeader">
      <Link to="/" className="brandLink"><Brand /></Link>
      <button className="iconButton mobileOnly" onClick={() => setOpen((v) => !v)} aria-label="Abrir menu">
        {open ? <X /> : <Menu />}
      </button>
      <nav className={open ? 'publicNav open' : 'publicNav'} onClick={() => setOpen(false)}>
        <NavLink to="/">Início</NavLink>
        <NavLink to="/loja/deposito-central">Ver demonstração</NavLink>
        <NavLink to="/planos">Planos</NavLink>
        <NavLink to="/entrar">Entrar</NavLink>
        <Link to="/cadastro" className="button small">Criar minha loja</Link>
      </nav>
    </header>
  )
}
