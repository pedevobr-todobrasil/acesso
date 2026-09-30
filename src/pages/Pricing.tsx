import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'

export default function Pricing() {
  return <><PublicHeader /><main className="pageWidth sectionPad pricingPage">
    <div className="sectionHeading"><span className="eyebrow">Preço simples</span><h1>Um plano fácil de entender.</h1><p>Sem tabela complicada. A proposta inicial do Pedevo é cobrar pouco e entregar o essencial para a loja começar a vender.</p></div>
    <div className="pricingMainCard">
      <div><span className="planBadge">LANÇAMENTO</span><h2>Pedevo Essencial</h2><p>Para negócios que querem receber pedidos por delivery e retirada.</p></div>
      <div className="priceBig"><small>Comece por</small><strong>R$ 29,90</strong><span>60 dias de uso incluídos</span><hr/><b>Depois R$ 19,90/mês</b></div>
      <ul>
        {['Loja online personalizada','Cadastro de produtos e categorias','Carrinho e checkout','Delivery e retirada','Pix, dinheiro e cartão na entrega','Painel de pedidos','Taxa de entrega e pedido mínimo','Suporte a depósitos de bebidas','Painel de vendas e clientes','Atualizações do sistema'].map((item) => <li key={item}><Check size={18}/>{item}</li>)}
      </ul>
      <Link to="/cadastro" className="button large">Criar minha loja</Link>
    </div>
    <div className="legalNote">Cobrança recorrente automática ainda não está habilitada neste MVP. A integração com um provedor de pagamentos será feita antes da operação comercial.</div>
  </main></>
}
