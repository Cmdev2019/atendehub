# ─────────────────────────────────────────────────────────────────────────────
# AtendeHub — nginx (produção): serve o build estático do front (Vite+React)
# e faz proxy reverso pra API. Contexto de build: raiz do repo (precisa do
# front E deste Dockerfile/nginx.conf).
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS build
WORKDIR /app

# Vite injeta VITE_* no bundle em tempo de BUILD (é estático depois) —
# por isso entram como build arg, não como env var de runtime do container.
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_ENV=production
ARG VITE_APP_NAME=AtendeHub
ARG VITE_APP_VERSION=0.1.0
# Opcional (B-18) — vazio é um no-op seguro no Sentry.init(), não precisa de ":?"
ARG VITE_SENTRY_DSN=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_ENV=$VITE_ENV \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_APP_VERSION=$VITE_APP_VERSION \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 443
