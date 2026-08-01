# ─────────────────────────────────────────────────────────────────────────────
# AtendeHub API — build de produção (NestJS)
# node:slim (glibc) em vez de alpine — bcrypt/prisma usam binários nativos
# pré-compilados pra glibc; alpine (musl) exigiria toolchain de compilação.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:25-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM node:25-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Prisma engine precisa de OpenSSL em runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main"]
