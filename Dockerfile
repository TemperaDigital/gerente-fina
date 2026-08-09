# =====================================================================
# Gerente FINA — Dockerfile (multi-stage, preset node-server)
# Build:  docker build -t gerente-finna:latest .
# =====================================================================

# ---------- build stage ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Instala dependencias primeiro (cache). O postinstall roda patch-package
# (ver patches/nf3+0.3.18.patch — corrige bug de build do preset node-server).
COPY package.json package-lock.json ./
RUN npm ci

# Copia o restante e builda o TanStack Start no preset node-server.
# As credenciais publicas do Supabase (URL/anon key) ja estao hardcoded
# em src/lib/supabase/config.ts — nao precisam de ARG/ENV de build aqui.
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build

# ---------- runtime stage ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Copia apenas a saida do Nitro
COPY --from=builder /app/.output ./.output

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
