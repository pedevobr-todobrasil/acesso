import { ArrowRight, BadgeCheck, Bike, Boxes, Check, CreditCard, LayoutDashboard, QrCode, Smartphone, Store, Wine } from 'lucide-react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'

const segments = ['Hamburguerias', 'Pizzarias', 'Pastelarias', 'Docerias', 'Açaí', 'Marmitarias', 'Restaurantes', 'Depósitos de bebidas', 'Conveniências']

export default function Landing() {
  return (
    <>
      <PublicHeader />
      <main>
        <section className="landingHero pageWidth">
          <div className="landingHeroCopy">
            <span className="eyebrow">Seu negócio vendendo online sem complicação</span>
            <h1>Crie sua loja de pedidos, delivery e retirada com o <em>Pedevo</em>.</h1>
            <p>Uma plataforma simples para pequenos comércios venderem pelo celular, organizarem pedidos e cuidarem do cardápio sem depender de conhecimento técnico.</p>
            <div className="heroActions">
              <Link to="/cadastro" className="button large">Criar minha loja <ArrowRight size={19} /></Link>
              <Link to="/loja/deposito-central" className="button secondary large">Ver loja de demonstração</Link>
            </div>
            <div className="trustRow">
              <span><Check size={16} /> Delivery e retirada</span>
              <span><Check size={16} /> Fácil de configurar</span>
              <span><Check size={16} /> Funciona no celular</span>
            </div>
          </div>
          <div className="phoneMockupWrap">
            <div className="phoneMockup">
              <div className="phoneTop"></div>
              <div className="mockStoreHeader"><span>Depósito Central</span><small>Aberto agora</small></div>
              <div className="mockSearch">Buscar produtos...</div>
              <div className="mockCategories"><span>🍺</span><span>🥤</span><span>🧊</span><span>⚡</span></div>
              <div className="mockProduct"><b>🍺</b><div><strong>Cerveja Pilsen 350ml</strong><small>Bem gelada</small><em>R$ 3,49</em></div><button>+</button></div>
              <div className="mockProduct"><b>🧊</b><div><strong>Gelo 5kg</strong><small>Gelo filtrado</small><em>R$ 12,00</em></div><button>+</button></div>
              <div className="mockCart">Ver carrinho • R$ 15,49</div>
            </div>
            <div className="floatingBadge badgeOne"><Bike size={18} /> Entrega rápida</div>
            <div className="floatingBadge badgeTwo"><BadgeCheck size={18} /> Pedido recebido</div>
          </div>
        </section>

        <section className="segmentStrip">
          <div className="pageWidth segmentList">{segments.map((segment) => <span key={segment}>{segment}</span>)}</div>
        </section>

        <section className="pageWidth sectionPad">
          <div className="sectionHeading">
            <span className="eyebrow">Tudo em um só lugar</span>
            <h2>Do cadastro do produto até o pedido pronto.</h2>
            <p>O Pedevo foi pensado para o dono da loja conseguir operar sozinho, com telas claras e poucos cliques.</p>
          </div>
          <div className="featureGrid">
            <article className="featureCard"><Boxes /><h3>Produtos sem complicação</h3><p>Cadastre foto, nome, descrição, preço, estoque e categoria em uma tela simples.</p></article>
            <article className="featureCard"><LayoutDashboard /><h3>Painel do lojista</h3><p>Acompanhe pedidos, vendas, clientes e produtos de um jeito fácil de entender.</p></article>
            <article className="featureCard"><Bike /><h3>Delivery ou retirada</h3><p>Configure taxa de entrega, bairros atendidos, pedido mínimo e retirada na loja.</p></article>
            <article className="featureCard"><CreditCard /><h3>Pagamentos</h3><p>Pix, dinheiro e cartão na entrega. Pagamento online poderá ser ativado em uma próxima fase.</p></article>
            <article className="featureCard"><Wine /><h3>Depósitos de bebidas</h3><p>Venda por unidade, pack, fardo ou caixa e marque produtos com venda exclusiva para maiores de 18 anos.</p></article>
            <article className="featureCard"><QrCode /><h3>Link e QR Code</h3><p>Divulgue sua loja no Instagram, WhatsApp, balcão, embalagem e cartão do estabelecimento.</p></article>
          </div>
        </section>

        <section className="howSection">
          <div className="pageWidth sectionPad">
            <div className="sectionHeading light"><span className="eyebrow">Começar é simples</span><h2>Sua loja pronta em poucos passos.</h2></div>
            <div className="stepsGrid">
              <div><span>01</span><h3>Crie sua conta</h3><p>Informe seus dados básicos e o tipo do negócio.</p></div>
              <div><span>02</span><h3>Configure a loja</h3><p>Adicione logo, WhatsApp, endereço, entrega e pagamentos.</p></div>
              <div><span>03</span><h3>Cadastre produtos</h3><p>Inclua fotos, preços, categorias e disponibilidade.</p></div>
              <div><span>04</span><h3>Comece a vender</h3><p>Compartilhe seu link e receba os pedidos no painel.</p></div>
            </div>
          </div>
        </section>

        <section className="pageWidth sectionPad pricingTeaser">
          <div>
            <span className="eyebrow">Oferta de lançamento</span>
            <h2>Comece pequeno e cresça com o Pedevo.</h2>
            <p>Plano pensado para pequenos negócios que precisam vender sem assumir um custo alto no início.</p>
          </div>
          <div className="priceCard featured">
            <span>Plano lançamento</span>
            <strong>R$ 29,90</strong>
            <small>pagamento inicial</small>
            <ul>
              <li><Check /> 60 dias de uso incluídos</li>
              <li><Check /> Depois R$ 19,90/mês</li>
              <li><Check /> Loja e painel completos</li>
              <li><Check /> Cancele quando quiser</li>
            </ul>
            <Link to="/cadastro" className="button large">Quero começar <ArrowRight size={18} /></Link>
          </div>
        </section>

        <section className="ctaBand">
          <div className="pageWidth ctaInner">
            <div><Smartphone size={36} /><h2>Seu negócio pode começar a vender online hoje.</h2><p>Hamburgueria, depósito de bebidas, pastelaria, doceria ou qualquer pequeno comércio.</p></div>
            <Link to="/cadastro" className="button lightButton large">Criar minha loja <ArrowRight /></Link>
          </div>
        </section>
      </main>
      <footer className="footer"><div className="pageWidth"><strong>Pedevo</strong><span>Seu delivery, do seu jeito.</span><small>Projeto MVP • Brasil</small></div></footer>
    </>
  )
}
