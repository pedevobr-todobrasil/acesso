# Pedevo SaaS — versão 0.2

Plataforma de pedidos, delivery e retirada para pequenos negócios.

A proposta do Pedevo é permitir que o dono de uma hamburgueria, pizzaria, pastelaria, doceria, açaiteria, marmitaria, restaurante, depósito de bebidas, conveniência ou outro comércio crie uma loja digital simples e receba pedidos sem precisar saber programação.

## O que esta versão já contém

### Cliente final
- Landing page do Pedevo
- Página de planos
- Loja demonstrativa responsiva
- Busca de produtos
- Categorias
- Carrinho persistido no navegador
- Delivery ou retirada
- Cadastro de endereço
- Pix, dinheiro e cartão na entrega
- Confirmação +18 para itens alcoólicos
- Tela de pedido concluído
- Atalho para WhatsApp da loja

### Lojista
- Cadastro e login com Supabase Auth quando configurado
- Modo demonstração sem Supabase
- Onboarding em 4 passos
- Painel com indicadores
- Pedidos
- Produtos
- Categorias
- Entregas e taxas por bairro
- Pagamentos
- Relatórios
- Dados da loja
- Configurações
- Suporte a depósitos de bebidas

### Pedevo / administrador
- Dashboard master demonstrativo
- Indicadores de lojas e assinantes
- Status de assinatura
- Estrutura de permissões administrativas no banco

### Infraestrutura
- React + TypeScript + Vite
- Supabase Auth + Postgres + Storage
- RLS (Row Level Security)
- RPC segura para criação de pedidos (`place_order`)
- GitHub Actions para build e deploy no GitHub Pages
- HashRouter para funcionar corretamente em páginas internas do GitHub Pages

---

# 1. Rodar no computador

## Instale primeiro
1. Node.js LTS: https://nodejs.org/
2. Visual Studio Code: https://code.visualstudio.com/
3. Git: https://git-scm.com/

## Depois
Abra a pasta `pedevo-saas` no Visual Studio Code.

No menu **Terminal > New Terminal**, execute:

```bash
npm install
npm run dev
```

O terminal mostrará um endereço local, normalmente parecido com:

```text
http://localhost:5173
```

Abra esse endereço no navegador.

> Sem configurar Supabase, o Pedevo entra em modo demonstração para você conseguir testar as telas.

---

# 2. Criar o Supabase

1. Entre em https://supabase.com/
2. Crie uma conta.
3. Clique em **New project**.
4. Escolha o nome `pedevo`.
5. Guarde a senha do banco.
6. Aguarde o projeto ser criado.

## Criar tabelas e segurança

No painel do Supabase:

1. Abra **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo `supabase/schema.sql` deste projeto.
4. Copie todo o conteúdo.
5. Cole no SQL Editor.
6. Clique em **Run**.

Esse SQL cria:

- profiles
- admin_users
- stores
- categories
- products
- delivery_zones
- customers
- orders
- order_items
- subscriptions
- bucket público `products`
- políticas RLS
- função segura `place_order`

---

# 3. Conectar o site ao Supabase

No Supabase, procure as credenciais do projeto:

- Project URL
- chave pública / anon key

Na raiz do projeto, copie:

```text
.env.example
```

para:

```text
.env.local
```

Preencha assim:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA_ANON
```

Nunca coloque `service_role` em `.env.local` usado pelo frontend e nunca publique uma chave `service_role` no GitHub.

Depois reinicie:

```bash
npm run dev
```

---

# 4. Criar o primeiro administrador do Pedevo

Primeiro crie sua conta usando a tela **Criar conta** do Pedevo.

Depois no Supabase:

1. Abra **Authentication > Users**.
2. Encontre sua conta.
3. Copie o UUID do usuário.
4. Abra o SQL Editor.
5. Execute:

```sql
insert into public.admin_users(user_id)
values ('COLE-SEU-UUID-AQUI');
```

Essa conta poderá futuramente acessar os dados do painel master Pedevo.

---

# 5. Subir para o GitHub

Crie um repositório novo no GitHub, por exemplo:

```text
pedevo-saas
```

Dentro da pasta do projeto, execute:

```bash
git init
git add .
git commit -m "Primeira versão do Pedevo"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/pedevo-saas.git
git push -u origin main
```

Se o GitHub pedir autenticação, use o fluxo indicado pelo próprio Git/GitHub.

---

# 6. Configurar variáveis no GitHub

No repositório:

1. **Settings**
2. **Secrets and variables**
3. **Actions**
4. **New repository secret**

Crie estes dois secrets:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Use os mesmos valores públicos do seu Supabase.

> A anon key foi feita para ser usada no cliente em conjunto com RLS. A chave `service_role` é secreta e não deve ser usada no GitHub Pages/frontend.

---

# 7. Publicar no GitHub Pages

O projeto já possui:

```text
.github/workflows/deploy.yml
```

No GitHub:

1. Abra **Settings**.
2. Abra **Pages**.
3. Em **Source**, escolha **GitHub Actions**.
4. Vá para a aba **Actions**.
5. Aguarde o workflow `Deploy Pedevo to GitHub Pages` concluir.

A URL ficará parecida com:

```text
https://SEU-USUARIO.github.io/pedevo-saas/
```

O sistema usa `HashRouter`, então endereços internos ficam parecidos com:

```text
https://SEU-USUARIO.github.io/pedevo-saas/#/painel
```

Isso evita erro 404 no GitHub Pages durante esta fase inicial.

---

# 8. Modelo comercial configurado no projeto

Oferta inicial planejada:

- entrada: R$ 29,90
- 60 dias de uso incluídos
- depois: R$ 19,90 por mês

A tabela `subscriptions` já possui campos para esse modelo.

## Importante

A cobrança automática ainda não está implementada nesta versão.

Antes de cobrar clientes reais, será necessário integrar um gateway de pagamento no backend/Edge Function, por exemplo Mercado Pago, Asaas ou outro provedor escolhido, usando webhook para atualizar a assinatura.

Nunca coloque token secreto de gateway no frontend ou em código público do GitHub Pages.

---

# 9. Venda de bebidas alcoólicas

O Pedevo já possui estrutura para:

- marcar produto como `requires_age_18`
- mostrar selo 18+
- exigir confirmação de maioridade no checkout
- registrar `age_confirmed` no pedido

Isso não substitui as obrigações legais do lojista. Antes de colocar esse segmento em produção, valide os requisitos legais aplicáveis à venda e entrega de bebidas alcoólicas na região onde o serviço operar.

---

# 10. Estrutura do projeto

```text
pedevo-saas/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── src/
│   ├── components/
│   ├── context/
│   ├── data/
│   ├── lib/
│   ├── pages/
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   └── types.ts
├── supabase/
│   └── schema.sql
├── .env.example
├── index.html
├── package.json
└── vite.config.ts
```

---

# Próximas etapas técnicas

A versão 0.2 já serve para validar o produto e a experiência visual. Para transformar o MVP em operação real, seguir nesta ordem:

1. Conectar onboarding ao cadastro real de `stores`.
2. Trocar os dados demonstrativos da vitrine por dados do Supabase.
3. Conectar cadastro/edição/exclusão de produtos ao banco.
4. Implementar upload real de imagens no Storage.
5. Usar `place_order` no checkout real.
6. Carregar pedidos reais no painel do lojista.
7. Adicionar atualização/realtime de pedidos.
8. Criar cobrança da assinatura com backend seguro + webhook.
9. Criar bloqueio controlado quando assinatura estiver vencida.
10. Adicionar domínio oficial do Pedevo.
11. Depois: QR Code, cupons, impressão, fidelidade, motoboy e IA.

---

## Nome e posicionamento

**Pedevo**  
**Seu delivery, do seu jeito.**

Produto pensado para pequenos negócios venderem online de forma simples.
