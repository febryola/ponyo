-- Every catalog product gets a unique SKU, including products whose source omits one.
alter table public.products
add column if not exists sku text;
update public.products
set sku = 'PNY-' || upper(
        substr(
            replace(
                coalesce(
                    shopify_variant_id::text,
                    shopify_product_id::text,
                    id::text
                ),
                '-',
                ''
            ),
            1,
            16
        )
    )
where sku is null
    or btrim(sku) = '';
alter table public.products
alter column sku
set not null;
create unique index if not exists products_sku_unique on public.products(sku);
comment on column public.products.sku is 'Unique public product SKU; falls back to a Ponyo-generated code when the supplier omits one.';