# Build multi-stage de Next.js (ver docs/DEPLOYMENT.md).
#
# Usa `output: "standalone"` (ver next.config.ts) en vez de copiar `.next` + `node_modules` de
# producción completos como describe DEPLOYMENT.md literalmente: `.next/standalone` ya trae un
# `server.js` mínimo con solo los módulos realmente usados, así que el runner final no necesita
# `npm ci --omit=dev` ni copiar node_modules — imagen más chica, mismo resultado (usuario no-root,
# HEALTHCHECK contra /api/health).

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Sin curl/wget en la imagen alpine mínima: se usa el módulo http de Node directamente.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
