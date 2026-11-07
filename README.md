# Ponyo storefront preview

A responsive Next.js storefront that uses the provided `src/ponyo-shopify` theme as a **visual reference**. It runs without Shopify credentials or a Supabase project. For local-only design review, catalog/cart/orders/forms use browser preview data. To connect the storefront to the planned AWS FastAPI backend, set the public API origin described in [docs/backend-api-contract.md](docs/backend-api-contract.md).

## Run locally

- Node.js 22.13+ (`.nvmrc` pins 22.13.0)
- npm

Install dependencies and run the development server with `npm run dev`. Open http://localhost:3000. No environment variables are required for preview mode.

Optional backend connection: copy `.env.example` to `.env.local`, set `NEXT_PUBLIC_PONYO_API_BASE_URL` to the HTTPS FastAPI API origin, and set `PONYO_MEDIA_HOST` to the exact S3/CloudFront hostname if the API returns images from it. The frontend client contract is documented in [docs/backend-api-contract.md](docs/backend-api-contract.md). Never add AWS, database, supplier, or payment secrets to the frontend or to a `NEXT_PUBLIC_` variable. The actual API implementation must be deployed separately in the AWS backend.

## Main routes

- `/` — responsive homepage, animated stats, merchandising shelves, category rails, size guide, and newsletter preview.
- `/collections/[slug]` and `/shop` — responsive collection banner, filters, sorting, and product cards.
- `/products/[slug]` — product gallery and purchase preview.
- `/account/login`, `/account/register`, `/account/forgot-password`, and `/orders` — account/order screens; they use local preview behavior until the API is configured.
- `/cart`, `/checkout`, and `/wishlist` — browser-local interaction previews; configured checkout redirects to the backend-provided hosted payment session.
- `/blogs/news` — Plush Journal landing page.
- `/pages/about`, `/pages/faq`, `/pages/contact`, `/pages/domina-xl` — storefront information pages.

All UI changes should be compared against the Liquid/theme files in `src/ponyo-shopify`; treat that folder as read-only reference. Stripe/Adyen, inventory, supplier integrations, persistence, and payment webhooks are backend responsibilities described in the API contract; this repository only contains the frontend client adapter.

## Validate

Run `npm run lint` and `npm run build`.