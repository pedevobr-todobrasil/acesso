import { Navigate, Route, Routes } from 'react-router-dom'
import MfaGate from './components/MfaGate'
import Auth from './pages/Auth'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Landing from './pages/Landing'
import MfaVerify from './pages/MfaVerify'
import Onboarding from './pages/Onboarding'
import OrderSuccess from './pages/OrderSuccess'
import OwnerPanel from './pages/OwnerPanel'
import Pricing from './pages/Pricing'
import SaaSAdmin from './pages/SaaSAdmin'
import Storefront from './pages/Storefront'

export default function App() {
  return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/planos" element={<Pricing />} />
    <Route path="/loja/:slug" element={<Storefront />} />
    <Route path="/carrinho" element={<Cart />} />
    <Route path="/checkout" element={<Checkout />} />
    <Route path="/pedido-concluido" element={<OrderSuccess />} />
    <Route path="/entrar" element={<Auth mode="login" />} />
    <Route path="/admin/entrar" element={<Auth mode="login" area="admin" />} />
    <Route path="/cadastro" element={<Auth mode="signup" />} />
    <Route path="/onboarding" element={<MfaGate area="owner"><Onboarding /></MfaGate>} />
    <Route path="/seguranca/verificar" element={<MfaVerify />} />
    <Route path="/painel/*" element={<MfaGate area="owner"><OwnerPanel /></MfaGate>} />
    <Route path="/admin" element={<MfaGate area="admin"><SaaSAdmin /></MfaGate>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
