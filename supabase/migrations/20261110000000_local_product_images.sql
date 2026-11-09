-- Move catalog/order image references to assets served by the Ponyo storefront.
update public.products
set image_url = '/images/catalog/' || regexp_replace(split_part(image_url, '?', 1), '^.*/', '')
where image_url like '%shopify.com/%';
update public.product_images
set image_url = '/images/catalog/' || regexp_replace(split_part(image_url, '?', 1), '^.*/', '')
where image_url like '%shopify.com/%';
update public.order_items
set image_url = '/images/catalog/' || regexp_replace(split_part(image_url, '?', 1), '^.*/', '')
where image_url like '%shopify.com/%';
-- These legacy identifiers were only used by the retired catalog-sync/cart-link flow.
drop index if exists public.products_shopify_product_id_unique;
alter table public.products drop column if exists shopify_product_id,
    drop column if exists shopify_variant_id;