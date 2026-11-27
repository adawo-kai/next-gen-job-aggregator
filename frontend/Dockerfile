# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
# browser API base; may be relative ("/api/v1") to go through the same-origin proxy below
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
# where the Next server proxies /api/v1/* (rewrites are resolved at build time, so it must be set here)
ARG INTERNAL_API_URL=http://localhost:8000
# bot linked from the "open in Telegram" screen of the Mini App
ARG NEXT_PUBLIC_BOT_USERNAME=NextGenJobAgr_bot
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV INTERNAL_API_URL=${INTERNAL_API_URL}
ENV NEXT_PUBLIC_BOT_USERNAME=${NEXT_PUBLIC_BOT_USERNAME}
# production: no demo fallback; public origin for SEO (canonical, sitemap, OG); optional analytics/monitoring
ARG NEXT_PUBLIC_DEMO_FALLBACK=1
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_YM_ID=
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_DEMO_FALLBACK=${NEXT_PUBLIC_DEMO_FALLBACK} NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} NEXT_PUBLIC_YM_ID=${NEXT_PUBLIC_YM_ID} NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
