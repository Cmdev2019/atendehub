# ─────────────────────────────────────────────────────────────────────────────
# AtendeHub API — build de produção (NestJS)
# node:slim (glibc) em vez de alpine — bcrypt/prisma usam binários nativos
# pré-compilados pra glibc; alpine (musl) exigiria toolchain de compilação.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:24-bookworm-slim AS build
WORKDIR /app

# OpenSSL também no build: o `prisma generate` escolhe o engine pela versão do
# OpenSSL que encontra. Sem ele, gera para openssl-1.1 e o runtime (que tem
# OpenSSL 3) não sobe — era por isso que o runtime gerava o client de novo.
RUN apt-get update   && apt-get install -y --no-install-recommends openssl   && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Só as dependências de produção seguem para o runtime — o client do Prisma
# já gerado acima vai junto (B-44: antes o runtime fazia um segundo npm ci e
# um segundo prisma generate). O CLI `prisma` continua presente: o
# @prisma/client 5 o instala como dependência, e o deploy usa para migrar.
RUN npm prune --omit=dev

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Prisma engine precisa de OpenSSL em runtime. tini (B-44) vira o PID 1:
# repassa o SIGTERM ao node e recolhe processos órfãos — com o node como PID 1
# o sinal era ignorado e o `docker stop` acabava em SIGKILL (exit 137).
RUN apt-get update   && apt-get install -y --no-install-recommends openssl tini   && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/dist ./dist

# B-44: nada de root em produção — o usuário `node` já existe na imagem base.
USER node

EXPOSE 3001

# B-44: liveness (`/health`, não checa dependências — quem checa é o
# `/health/ready`, usado pelo balanceador). Sem curl na imagem slim: usa o
# fetch do próprio Node.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3   CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.APP_PORT||3001)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main"]
