import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import { formatBRL } from '../lib/format'
import { getPublicSaasPlans, rememberSelectedSaasPlan } from '../lib/pedevoApi'

const fallback = [{
  id: 'fallback', code: 'pedevo-essencial', name: 'Pedevo Essencial', description: 'Para negócios que querem receber pedidos por delivery e retirada.', badge: 'LANÇAMENTO', activation_price: 29.9, included_days: 60, renewal_price: 19.9, renewal_months: 1, is_default: true,
}]

function renewalLabel(plan: any) {
  const months = Number(plan.renewal_months || 1)
  return months === 1 ? `${formatBRL(Number(plan.renewal_price || 0))}/mês` : `${formatBRL(Number(plan.renewal_price || 0))} a cada ${months} meses`
}

export default function Pricing() {
  const [plans, setPlans] = useState<any[]>(fallback)

  useEffect(() => {
    getPublicSaasPlans().then((result: any) => {
      if (!result.error && result.data?.length) setPlans(result.data)
    })
  }, [])

  return <><PublicHeader /><main className="pageWidth sectionPad pricingPage">
    <div className="sectionHeading"><span className="eyebrow">Planos e promoções</span><h1>Escolha a condição que combina com seu negócio.</h1><p>O Painel Master do Pedevo pode criar ofertas temporárias, períodos especiais e pacotes com ciclos diferentes.</p></div>
    <div className="dynamicPricingGrid">
      {plans.map((plan) => <div key={plan.id || plan.code} className={`pricingMainCard dynamicPlanCard ${plan.is_default ? 'featuredPlan' : ''}`}>
        <div><span className="planBadge">{plan.badge || (plan.is_default ? 'RECOMENDADO' : 'PEDEVO')}</span><h2>{plan.name}</h2><p>{plan.description || 'Loja online, pedidos, delivery e painel completo.'}</p></div>
        <div className="priceBig"><small>Ativação</small><strong>{formatBRL(Number(plan.activation_price || 0))}</strong><span>{Number(plan.included_days || 0) > 0 ? `${plan.included_days} dias de acesso incluídos` : 'Acesso liberado no ciclo contratado'}</span><hr/><b>Renovação: {renewalLabel(plan)}</b></div>
        <ul>{['Loja online personalizada','Produtos e categorias','Carrinho e checkout','Delivery e retirada','Pix e formas de pagamento','Painel de pedidos e clientes','Relatórios e configurações','Atualizações do sistema'].map((item)=><li key={item}><Check size={18}/>{item}</li>)}</ul>
        <Link to="/cadastro" className="button large" onClick={()=>rememberSelectedSaasPlan(plan.code)}>Escolher {plan.name}</Link>
        {(plan.starts_at || plan.ends_at) && <small className="planValidity">{plan.starts_at ? `Válido a partir de ${new Date(plan.starts_at).toLocaleDateString('pt-BR')}` : 'Disponível agora'}{plan.ends_at ? ` até ${new Date(plan.ends_at).toLocaleDateString('pt-BR')}` : ''}</small>}
      </div>)}
    </div>
    <div className="legalNote">Os valores e períodos exibidos nesta página são controlados pelo Painel Master. A confirmação da adesão e das renovações continua no fluxo administrativo até a automação financeira ser ativada.</div>
  </main></>
}
