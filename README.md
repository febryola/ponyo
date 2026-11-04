# Ponyo

Ponyo is a product catalog and order-routing MVP built with Next.js App Router, React, TypeScript, Tailwind CSS, and Supabase. It deliberately does not manage inventory or take payments yet. The existing storefront wireframe and its product photography remain in `src/sample-frontend/`; the app reuses its images while rebuilding the customer pages as Next.js routes and reusable components.

## Requirements

- Node.js 22.13+; `.nvmrc` pins 22.13.0.
- npm
- A Supabase project for database-backed products (optional for local preview).

## Run locally

```bash
nvm use
npm install
npm run dev
```

Open http://localhost:3000. Without Supabase credentials the storefront uses a small sample catalog, so the UI can be explored immediately.

## Supabase setup

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project API settings.
3. Apply `supabase/migrations/20261104000000_initial_schema.sql` in the Supabase SQL Editor (or with the Supabase CLI).
4. Add supplier, category, and published product records before expecting live products to appear.

The public anon key is intended for browser-safe access and must be paired with the migration's RLS policies. Never expose a Supabase service-role key using a `NEXT_PUBLIC_` variable. Customer/order tables have RLS enabled but no public read/write policies; order writes should go through a validated server-side flow.

## Current foundation

- `/` — responsive Ponyo storefront landing page using the existing wireframe hero and product photography.
- `/shop` — product listing with category query filters.
- `/products/[slug]` — product details and supplier availability note.
- `/cart`, `/checkout`, `/orders` — clearly marked MVP placeholders.
- `GET /api/products` — catalog data from Supabase, or the wireframe sample catalog if Supabase is not configured.
- `POST /api/orders` — intentionally returns `503` until payment policy, validation, and server-side persistence are agreed.
- `supabase/migrations/` — starter schema for suppliers, products, images, categories, customers, orders, routing, and status history.

Product availability is descriptive (`available`, `unavailable`, or `needs_confirmation`); there are no stock counts, reservations, or warehouse workflows.

## Before implementing checkout

Confirm with Sergio: will customers pay Ponyo, or will Ponyo forward orders and customers pay the supplier? This decision changes payment integration, refunds, and order statuses. Also define supplier confirmation and cancellation handling before enabling order submission.

## Validate and deploy

```bash
npm run lint
npm run build
```

Connect the repository to Vercel and add the two Supabase environment variables in the Vercel project settings. Do not commit `.env.local`.
