# ─── Stage 1: Build ──────────────────────────────────
FROM node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS base

RUN apk upgrade --no-cache && apk add --no-cache ca-certificates openssl

FROM base AS builder

WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://registry.npmjs.org/ \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm ci --no-audit --no-fund

COPY prisma ./prisma
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ─── Stage 2: Production ────────────────────────────
FROM base AS runner

WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://registry.npmjs.org/ \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm ci --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

ENV NODE_ENV=production

# npm 的獨立 HTTP client 與應用依賴分開修補，保留真實 npm 版號。
RUN npm install --prefix /tmp/npm-security --ignore-scripts --no-audit --no-fund undici@6.29.1 \
  && rm -rf /usr/local/lib/node_modules/npm/node_modules/undici \
  && cp -a /tmp/npm-security/node_modules/undici /usr/local/lib/node_modules/npm/node_modules/undici \
  && rm -rf /tmp/npm-security \
  && node -e "if(require('/usr/local/lib/node_modules/npm/node_modules/undici/package.json').version!=='6.29.1')process.exit(1)"

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 啟動時先執行 migration 再啟動 server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
