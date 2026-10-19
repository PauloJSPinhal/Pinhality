# Pinhality - um só contentor: Express serve a API, as fotos e o frontend compilado.
#   Produção (Coolify): docker compose up            -> alvo "production"
#   Desenvolvimento:    docker compose -f docker-compose.dev.yml up  -> alvo "dev"

# ---------- Base comum: Node + exiftool + rclone ----------
# O sharp (miniaturas WebP) traz o libvips pré-compilado para Alpine (musl, x64 e arm64): não precisa de pacotes extra.
FROM node:22-alpine AS base
RUN apk add --no-cache exiftool rclone ca-certificates tzdata
WORKDIR /app

# ---------- Desenvolvimento: Vite (5173) + nodemon (3000) no mesmo contentor ----------
FROM base AS dev
COPY backend/package*.json /app/backend/
RUN cd /app/backend && npm ci
COPY frontend/package*.json /app/frontend/
RUN cd /app/frontend && npm ci
COPY scripts/dev.sh /usr/local/bin/pinhality-dev
RUN chmod +x /usr/local/bin/pinhality-dev
EXPOSE 5173 3000
CMD ["pinhality-dev"]

# ---------- Build do frontend (Vite) ----------
FROM node:22-alpine AS frontend-build
WORKDIR /src
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Produção ----------
FROM base AS production
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    PHOTOS_DIR=/dados_privados/fotos_gdrive \
    FRONTEND_DIR=/app/public
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/server.js backend/media.js ./
# Falha o build se o sharp não carregar nesta imagem
RUN node -e "const s=require('sharp'); console.log('sharp', s.versions.sharp, 'libvips', s.versions.vips)"
# Os JSON do repositório servem de dados iniciais quando o volume /data está vazio
COPY backend/photos.json backend/collections.json backend/categories.json backend/settings.json ./seed/
COPY --from=frontend-build /src/dist ./public
RUN mkdir -p /data /dados_privados/fotos_gdrive /dados_privados/derivados
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
