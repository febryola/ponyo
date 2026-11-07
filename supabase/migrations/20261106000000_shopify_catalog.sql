-- Shopify becomes the source of truth for public catalog content.
-- This migration only stores public product metadata; no customer/payment secrets are copied here.
alter table public.products
add column if not exists published_at timestamptz,
    add column if not exists shopify_product_id bigint,
    add column if not exists shopify_variant_id bigint,
    add column if not exists product_type text,
    add column if not exists tags text [] not null default '{}',
    add column if not exists compare_at_amount numeric(12, 2),
    add column if not exists availability_status text,
    add column if not exists size_tier text,
    add column if not exists dimensions text,
    add column if not exists dispatch_time text;
create unique index if not exists products_shopify_product_id_unique on public.products(shopify_product_id)
where shopify_product_id is not null;
create index if not exists products_tags_gin_idx on public.products using gin(tags);
create index if not exists products_product_type_idx on public.products(product_type);
comment on column public.products.shopify_product_id is 'Public Shopify product ID used by catalog synchronization.';
comment on column public.products.shopify_variant_id is 'Shopify variant ID used to create cart permalinks.';
comment on column public.products.tags is 'Shopify merchandising tags, e.g. rare, premium, new-arrival, domina-xl.';
comment on column public.products.compare_at_amount is 'Optional Shopify compare-at price, stored in the product currency.';