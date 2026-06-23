# Imagem pinada (paridade com engines.node >=22). Ajuste o patch conforme a release LTS atual.
FROM node:22.20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* precisam existir no build (inlined). EasyPanel injeta via build args/env.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build

FROM node:22.20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# dumb-init garante encaminhamento correto de sinais (SIGTERM no shutdown do EasyPanel)
RUN apk add --no-cache dumb-init \
  && addgroup -g 1001 -S nodejs \
  && adduser -S nextjs -u 1001
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
# Sem HEALTHCHECK no Dockerfile: no EasyPanel um healthcheck que falha marca o
# container como "unhealthy" e o proxy passa a devolver 502 mesmo com o app no ar.
# O EasyPanel monitora o serviço por conta própria; a rota /api/health continua
# disponível para checagens externas.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
