FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_PONYO_API_BASE_URL=/ponyo-api
ARG PONYO_LOCAL_PREVIEW=true
ARG PONYO_DEV_API_PROXY=true
ARG PONYO_DEV_API_PROXY_TARGET=http://api:8000
ARG PONYO_ALLOW_CLOUDFLARE_QUICK_TUNNEL=true
ENV NEXT_PUBLIC_PONYO_API_BASE_URL=$NEXT_PUBLIC_PONYO_API_BASE_URL \
    PONYO_LOCAL_PREVIEW=$PONYO_LOCAL_PREVIEW \
    PONYO_DEV_API_PROXY=$PONYO_DEV_API_PROXY \
    PONYO_DEV_API_PROXY_TARGET=$PONYO_DEV_API_PROXY_TARGET \
    PONYO_ALLOW_CLOUDFLARE_QUICK_TUNNEL=$PONYO_ALLOW_CLOUDFLARE_QUICK_TUNNEL
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
