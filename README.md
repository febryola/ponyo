# Ponyo storefront preview

A responsive Next.js storefront and FastAPI backend in one repository. The provided `src/ponyo-shopify` theme is a **visual reference**; Shopify is not the runtime backend. The storefront still runs in local preview mode without AWS or Stripe credentials. Backend endpoints, local services, and AWS foundation are in [backend/README.md](backend/README.md) and [infra/terraform/README.md](infra/terraform/README.md).

## Run locally

- Node.js 22.13+ (`.nvmrc` pins 22.13.0)
- npm

Install dependencies and run the development server with `npm run dev`. Open http://localhost:3000. No environment variables are required for preview mode.

Optional backend connection: start the local backend from [backend/README.md](backend/README.md), then copy the root `.env.example` to `.env.local` and set `NEXT_PUBLIC_PONYO_API_BASE_URL` to `http://localhost:8000`. For deployment, use the HTTPS API URL output by Terraform and the exact `PONYO_MEDIA_HOST` if media is served from an allowed CDN. The frontend contract is documented in [docs/backend-api-contract.md](docs/backend-api-contract.md). Never add AWS, database, supplier, or payment secrets to the frontend or to a `NEXT_PUBLIC_` variable.

## Main routes

- `/` — responsive homepage, animated stats, merchandising shelves, category rails, size guide, and newsletter preview.
- `/collections/[slug]` and `/shop` — responsive collection banner, filters, sorting, and product cards.
- `/products/[slug]` — product gallery and purchase preview.
- `/account/login`, `/account/register`, `/account/forgot-password`, and `/orders` — account/order screens; they use local preview behavior until the API is configured.
- `/cart`, `/checkout`, and `/wishlist` — browser-local interaction previews; configured checkout redirects to the backend-provided hosted payment session.
- `/blogs/news` — Plush Journal landing page.
- `/pages/about`, `/pages/faq`, `/pages/contact`, `/pages/domina-xl` — storefront information pages.

All UI changes should be compared against the Liquid/theme files in `src/ponyo-shopify`; treat that folder as read-only reference. The FastAPI backend now implements catalog, account/session, order history, checkout session, Stripe webhook, newsletter, and contact APIs. Real fulfillment queues, supplier integrations, email delivery, S3 upload/signing, and production AWS rollout still require configuration and additional work before accepting real payments.

## Validate

Run `npm run lint` and `npm run build`.