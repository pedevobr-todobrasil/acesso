-- ============================================================
-- PEDEVO - Supabase schema inicial
-- Execute este arquivo no SQL Editor de um projeto NOVO.
-- Banco: Postgres / Auth / Storage / RLS
-- ============================================================

create extension if not exists pgcrypto;

-- -----------------------------
-- Perfis e administradores
-- -----------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_pedevo_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

-- -----------------------------
-- Lojas
-- -----------------------------
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  business_type text not null default 'outro' check (business_type in (
    'hamburgueria','pizzaria','pastelaria','doceria','acai','marmitaria',
    'restaurante','deposito_bebidas','conveniencia','outro'
  )),
  description text,
  whatsapp text,
  logo_url text,
  primary_color text not null default '#ff5a1f',
  address_line text,
  city text,
  state text,
  postal_code text,
  is_active boolean not null default true,
  is_open boolean not null default true,
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  default_delivery_fee numeric(10,2) not null default 0 check (default_delivery_fee >= 0),
  min_order numeric(10,2) not null default 0 check (min_order >= 0),
  pix_enabled boolean not null default true,
  pix_key text,
  cash_enabled boolean not null default true,
  card_on_delivery_enabled boolean not null default true,
  age_restricted_sales boolean not null default false,
  opening_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stores_owner_idx on public.stores(owner_id);
create index if not exists stores_slug_idx on public.stores(slug);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  icon text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists categories_store_idx on public.categories(store_id);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  unit_label text not null default 'unidade',
  stock integer check (stock is null or stock >= 0),
  active boolean not null default true,
  featured boolean not null default false,
  requires_age_18 boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_store_idx on public.products(store_id);
create index if not exists products_category_idx on public.products(category_id);

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  fee numeric(10,2) not null default 0 check (fee >= 0),
  eta_min_minutes integer,
  eta_max_minutes integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists delivery_zones_store_idx on public.delivery_zones(store_id);

-- -----------------------------
-- Clientes e pedidos
-- -----------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  whatsapp text,
  address jsonb,
  created_at timestamptz not null default now()
);
create index if not exists customers_store_idx on public.customers(store_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  order_number bigint generated by default as identity,
  order_type text not null check (order_type in ('delivery','pickup')),
  payment_method text not null check (payment_method in ('pix','cash','card_on_delivery')),
  status text not null default 'pending' check (status in (
    'pending','accepted','preparing','ready','out_for_delivery','completed','cancelled'
  )),
  delivery_address jsonb,
  delivery_zone_id uuid references public.delivery_zones(id) on delete set null,
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  notes text,
  age_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_store_idx on public.orders(store_id, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_label text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  total numeric(10,2) not null
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- -----------------------------
-- Assinaturas Pedevo
-- -----------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  signup_fee numeric(10,2) not null default 29.90,
  included_days integer not null default 60,
  monthly_price numeric(10,2) not null default 19.90,
  status text not null default 'trial' check (status in ('trial','active','overdue','cancelled','blocked')),
  starts_at timestamptz not null default now(),
  included_until timestamptz,
  next_charge_at timestamptz,
  external_customer_id text,
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cria assinatura inicial automaticamente quando uma loja nasce.
create or replace function public.create_initial_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (store_id, included_until)
  values (new.id, now() + interval '60 days')
  on conflict (store_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_store_created_subscription on public.stores;
create trigger on_store_created_subscription
after insert on public.stores
for each row execute function public.create_initial_subscription();

-- -----------------------------
-- Função pública segura para criação de pedidos
-- O cliente NÃO envia preço final confiável. O banco recalcula pelos produtos.
-- -----------------------------
create or replace function public.place_order(
  p_store_id uuid,
  p_customer_name text,
  p_customer_whatsapp text,
  p_order_type text,
  p_payment_method text,
  p_delivery_address jsonb,
  p_delivery_zone_id uuid,
  p_notes text,
  p_age_confirmed boolean,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_customer_id uuid;
  v_store public.stores%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_product_name text;
  v_unit_label text;
  v_price numeric(10,2);
  v_requires_age boolean;
  v_subtotal numeric(10,2) := 0;
  v_delivery_fee numeric(10,2) := 0;
  v_has_age_item boolean := false;
begin
  select * into v_store
  from public.stores
  where id = p_store_id and is_active = true;

  if not found then
    raise exception 'Loja não encontrada ou inativa';
  end if;

  if p_order_type not in ('delivery','pickup') then
    raise exception 'Tipo de pedido inválido';
  end if;

  if p_order_type = 'delivery' and not v_store.delivery_enabled then
    raise exception 'Delivery indisponível';
  end if;

  if p_order_type = 'pickup' and not v_store.pickup_enabled then
    raise exception 'Retirada indisponível';
  end if;

  if p_payment_method not in ('pix','cash','card_on_delivery') then
    raise exception 'Forma de pagamento inválida';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrinho vazio';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));

    select name, unit_label, price, requires_age_18
      into v_product_name, v_unit_label, v_price, v_requires_age
    from public.products
    where id = v_product_id and store_id = p_store_id and active = true;

    if not found then
      raise exception 'Produto indisponível';
    end if;

    v_subtotal := v_subtotal + (v_price * v_quantity);
    if v_requires_age then v_has_age_item := true; end if;
  end loop;

  if v_subtotal < v_store.min_order then
    raise exception 'Pedido abaixo do valor mínimo';
  end if;

  if v_has_age_item and not p_age_confirmed then
    raise exception 'Confirmação de maioridade obrigatória';
  end if;

  if p_order_type = 'delivery' then
    if p_delivery_zone_id is not null then
      select fee into v_delivery_fee
      from public.delivery_zones
      where id = p_delivery_zone_id and store_id = p_store_id and active = true;
      if not found then raise exception 'Região de entrega inválida'; end if;
    else
      v_delivery_fee := v_store.default_delivery_fee;
    end if;
  end if;

  insert into public.customers (store_id, name, whatsapp, address)
  values (p_store_id, p_customer_name, p_customer_whatsapp, p_delivery_address)
  returning id into v_customer_id;

  insert into public.orders (
    store_id, customer_id, order_type, payment_method, delivery_address,
    delivery_zone_id, subtotal, delivery_fee, total, notes, age_confirmed
  ) values (
    p_store_id, v_customer_id, p_order_type, p_payment_method, p_delivery_address,
    p_delivery_zone_id, v_subtotal, v_delivery_fee, v_subtotal + v_delivery_fee,
    p_notes, p_age_confirmed
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));

    select name, unit_label, price
      into v_product_name, v_unit_label, v_price
    from public.products
    where id = v_product_id and store_id = p_store_id and active = true;

    insert into public.order_items (
      order_id, product_id, product_name, unit_label, quantity, unit_price, total
    ) values (
      v_order_id, v_product_id, v_product_name, v_unit_label,
      v_quantity, v_price, v_price * v_quantity
    );
  end loop;

  return v_order_id;
end;
$$;

-- -----------------------------
-- RLS
-- -----------------------------
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.stores enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.subscriptions enable row level security;

-- Perfis
create policy "profile own select" on public.profiles for select using (id = auth.uid() or public.is_pedevo_admin());
create policy "profile own update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Admin table: ninguém navega livremente pela lista, exceto admin já cadastrado.
create policy "admins read admins" on public.admin_users for select using (public.is_pedevo_admin());

-- Lojas
create policy "public read active stores" on public.stores for select using (is_active = true or owner_id = auth.uid() or public.is_pedevo_admin());
create policy "owner insert store" on public.stores for insert with check (owner_id = auth.uid());
create policy "owner update store" on public.stores for update using (owner_id = auth.uid() or public.is_pedevo_admin()) with check (owner_id = auth.uid() or public.is_pedevo_admin());
create policy "owner delete store" on public.stores for delete using (owner_id = auth.uid() or public.is_pedevo_admin());

-- Categorias
create policy "public read active categories" on public.categories for select using (
  active = true or exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
);
create policy "owner manage categories" on public.categories for all using (
  exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
) with check (
  exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
);

-- Produtos
create policy "public read active products" on public.products for select using (
  active = true or exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
);
create policy "owner manage products" on public.products for all using (
  exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
) with check (
  exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
);

-- Regiões de entrega
create policy "public read active delivery zones" on public.delivery_zones for select using (
  active = true or exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
);
create policy "owner manage delivery zones" on public.delivery_zones for all using (
  exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
) with check (
  exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
);

-- Clientes e pedidos: apenas dono/admin. Novos pedidos entram pela RPC place_order.
create policy "owner read customers" on public.customers for select using (
  exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
);
create policy "owner read orders" on public.orders for select using (
  exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
);
create policy "owner update orders" on public.orders for update using (
  exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
) with check (
  exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
);
create policy "owner read order items" on public.order_items for select using (
  exists(
    select 1 from public.orders o
    join public.stores s on s.id = o.store_id
    where o.id = order_id and (s.owner_id = auth.uid() or public.is_pedevo_admin())
  )
);

-- Assinaturas
create policy "owner read subscription" on public.subscriptions for select using (
  exists(select 1 from public.stores s where s.id = store_id and (s.owner_id = auth.uid() or public.is_pedevo_admin()))
);
create policy "admin manage subscriptions" on public.subscriptions for all using (public.is_pedevo_admin()) with check (public.is_pedevo_admin());

-- Permissões mínimas para Data API
revoke all on public.admin_users from anon, authenticated;
grant select on public.stores, public.categories, public.products, public.delivery_zones to anon, authenticated;
grant insert, update, delete on public.stores, public.categories, public.products, public.delivery_zones to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.customers, public.order_items, public.subscriptions, public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant execute on function public.place_order(uuid,text,text,text,text,jsonb,uuid,text,boolean,jsonb) to anon, authenticated;
grant execute on function public.is_pedevo_admin() to authenticated;

-- -----------------------------
-- Storage para imagens de produtos
-- Caminho recomendado: <USER_ID>/<arquivo>
-- -----------------------------
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do update set public = true;

create policy "public product images" on storage.objects
for select using (bucket_id = 'products');

create policy "owner uploads product images" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'products'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owner updates product images" on storage.objects
for update to authenticated
using (
  bucket_id = 'products'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'products'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owner deletes product images" on storage.objects
for delete to authenticated
using (
  bucket_id = 'products'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- Depois de criar sua primeira conta, torne-a administradora:
-- 1) Supabase > Authentication > Users > copie o UUID do seu usuário.
-- 2) Rode, trocando pelo UUID real:
-- insert into public.admin_users(user_id) values ('SEU-UUID-AQUI');
-- ============================================================
