-- Ponyo MVP catalog and order-routing schema. Inventory/stock quantities are intentionally excluded.
create extension if not exists pgcrypto;
create table public.suppliers (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text,
    phone text,
    website_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create table public.categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    created_at timestamptz not null default now()
);
create table public.products (
    id uuid primary key default gen_random_uuid(),
    supplier_id uuid not null references public.suppliers(id) on delete restrict,
    category_id uuid references public.categories(id) on delete
    set null,
        slug text not null unique,
        name text not null,
        description text,
        price_amount numeric(12, 2) not null check (price_amount >= 0),
        currency text not null default 'IDR',
        availability text not null default 'needs_confirmation' check (
            availability in ('available', 'unavailable', 'needs_confirmation')
        ),
        published boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
);
create table public.product_images (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    image_url text not null,
    alt_text text,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);
create table public.customers (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    email text not null,
    phone text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint customers_email_unique unique (email)
);
create table public.orders (
    id uuid primary key default gen_random_uuid(),
    order_number text not null unique,
    customer_id uuid not null references public.customers(id) on delete restrict,
    status text not null default 'pending_supplier_confirmation' check (
        status in (
            'pending_supplier_confirmation',
            'confirmed',
            'rejected',
            'processing',
            'shipped',
            'delivered',
            'cancelled',
            'refunded'
        )
    ),
    subtotal_amount numeric(12, 2) not null default 0 check (subtotal_amount >= 0),
    shipping_amount numeric(12, 2) not null default 0 check (shipping_amount >= 0),
    total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
    currency text not null default 'IDR',
    customer_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create table public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    product_id uuid not null references public.products(id) on delete restrict,
    product_name text not null,
    quantity integer not null check (quantity > 0),
    unit_price_amount numeric(12, 2) not null check (unit_price_amount >= 0),
    line_total_amount numeric(12, 2) not null check (line_total_amount >= 0),
    created_at timestamptz not null default now()
);
create table public.order_routing (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    supplier_id uuid not null references public.suppliers(id) on delete restrict,
    status text not null default 'pending' check (
        status in (
            'pending',
            'sent',
            'accepted',
            'rejected',
            'fulfilled',
            'failed'
        )
    ),
    forwarded_at timestamptz,
    supplier_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint order_routing_order_supplier_unique unique (order_id, supplier_id)
);
create table public.order_status_history (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    status text not null,
    note text,
    changed_by text,
    created_at timestamptz not null default now()
);
create index products_supplier_id_idx on public.products(supplier_id);
create index products_category_id_idx on public.products(category_id);
create index products_published_created_idx on public.products(published, created_at desc);
create index product_images_product_sort_idx on public.product_images(product_id, sort_order);
create index orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index order_items_order_id_idx on public.order_items(order_id);
create index order_routing_supplier_status_idx on public.order_routing(supplier_id, status);
create index order_status_history_order_created_idx on public.order_status_history(order_id, created_at desc);
-- Keep customer/order tables private. Public catalog reads are limited to published products.
alter table public.suppliers enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_routing enable row level security;
alter table public.order_status_history enable row level security;
create policy "Anyone can read categories" on public.categories for
select using (true);
create policy "Anyone can read published products" on public.products for
select using (published = true);
create policy "Anyone can read images of published products" on public.product_images for
select using (
        exists (
            select 1
            from public.products
            where products.id = product_images.product_id
                and products.published = true
        )
    );