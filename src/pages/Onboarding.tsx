import { ArrowLeft, ArrowRight, Check, MapPin, Store, Truck, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createStoreWithDefaults } from '../lib/pedevoApi'

const businessTypes = [
  ['hamburgueria','Hamburgueria','🍔'],['pizzaria','Pizzaria','🍕'],['pastelaria','Pastelaria','🥟'],['doceria','Doceria','🧁'],['acai','Açaí','🍧'],['marmitaria','Marmitaria','🍱'],['restaurante','Restaurante','🍽️'],['deposito_bebidas','Depósito de bebidas','🍺'],['conveniencia','Conveniência','🏪'],['outro','Outro','✨'],
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [data, setData] = useState({ name: '', businessType: 'deposito_bebidas', whatsapp: '', address: '', delivery: true, pickup: true, pix: true, cash: true, card: true })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const totalSteps = 4

  async function finish() {
    setSaving(true)
    setSaveError('')
    localStorage.setItem('pedevo-onboarding', JSON.stringify(data))
    const result = await createStoreWithDefaults(data)
    setSaving(false)
    if (result.error) {
      setSaveError(result.error.message || 'Não foi possível criar a loja.')
      return
    }
    navigate('/painel')
  }

  return <div className="onboardingPage"><div className="onboardingTop"><button onClick={() => step > 1 ? setStep(step - 1) : navigate('/cadastro')}><ArrowLeft/></button><div className="progressWrap"><span>Passo {step} de {totalSteps}</span><div><i style={{ width: `${(step / totalSteps) * 100}%` }}></i></div></div></div>
    <main className="onboardingCard">
      {step === 1 && <><div className="onboardingIcon"><Store/></div><span className="eyebrow">Sua loja</span><h1>Conte um pouco sobre seu negócio.</h1><p>Isso ajuda o Pedevo a preparar a experiência inicial da sua loja.</p><label>Nome do estabelecimento<input value={data.name} onChange={(e) => setData({...data,name:e.target.value})} placeholder="Ex.: Depósito Central"/></label><label>Tipo de negócio</label><div className="businessTypeGrid">{businessTypes.map(([value,label,emoji]) => <button key={value} onClick={() => setData({...data,businessType:value})} className={data.businessType === value ? 'selected' : ''}><span>{emoji}</span><small>{label}</small>{data.businessType === value && <Check/>}</button>)}</div></>}
      {step === 2 && <><div className="onboardingIcon"><MapPin/></div><span className="eyebrow">Contato e endereço</span><h1>Como seus clientes encontram você?</h1><p>Cadastre o WhatsApp que receberá contatos e o endereço principal do negócio.</p><label>WhatsApp<input value={data.whatsapp} onChange={(e) => setData({...data,whatsapp:e.target.value})} placeholder="(63) 99999-9999"/></label><label>Endereço<input value={data.address} onChange={(e) => setData({...data,address:e.target.value})} placeholder="Rua, número, bairro e cidade"/></label></>}
      {step === 3 && <><div className="onboardingIcon"><Truck/></div><span className="eyebrow">Pedidos</span><h1>Como você quer atender?</h1><p>Você poderá alterar estas opções quando quiser.</p><div className="toggleList"><label><div><strong>Delivery</strong><span>Entregar no endereço do cliente</span></div><input type="checkbox" checked={data.delivery} onChange={(e)=>setData({...data,delivery:e.target.checked})}/></label><label><div><strong>Retirada na loja</strong><span>Cliente busca no estabelecimento</span></div><input type="checkbox" checked={data.pickup} onChange={(e)=>setData({...data,pickup:e.target.checked})}/></label></div></>}
      {step === 4 && <><div className="onboardingIcon"><Wallet/></div><span className="eyebrow">Pagamentos</span><h1>Quais formas de pagamento você aceita?</h1><p>No MVP, o registro é feito no pedido e a cobrança acontece diretamente entre loja e cliente.</p><div className="toggleList"><label><div><strong>Pix</strong><span>Chave cadastrada na loja</span></div><input type="checkbox" checked={data.pix} onChange={(e)=>setData({...data,pix:e.target.checked})}/></label><label><div><strong>Dinheiro</strong><span>Pagamento na entrega/retirada</span></div><input type="checkbox" checked={data.cash} onChange={(e)=>setData({...data,cash:e.target.checked})}/></label><label><div><strong>Cartão</strong><span>Maquininha na entrega/retirada</span></div><input type="checkbox" checked={data.card} onChange={(e)=>setData({...data,card:e.target.checked})}/></label></div></>}
      {saveError && <div className="formError">{saveError}</div>}
      <div className="onboardingActions">{step < totalSteps ? <button className="button large" onClick={() => setStep(step + 1)} disabled={step === 1 && !data.name.trim()}>Continuar <ArrowRight/></button> : <button className="button large" onClick={finish} disabled={saving}>{saving ? 'Criando...' : 'Criar minha loja'} <Check/></button>}</div>
    </main>
  </div>
}
