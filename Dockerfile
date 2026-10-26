# Pinhality - um só contentor: Express serve a API, as fotos e o frontend compilado.
# Paulo: substitui os dois Dockerfiles antigos (frontend com nginx + backend). O build é feito por etapas:
# o frontend é compilado numa etapa à parte e só o resultado (pasta dist) entra na imagem final,
# que não leva ferramentas de desenvolvimento nem dependências de dev.
#   Produção (Coolify): docker compose up            -> alvo "production"
#   Desenvolvimento:    docker compose -f docker-compose.dev.yml up  -> alvo "dev"

# ---------- Base comum: Node + exiftool + rclone ----------
# O sharp (miniaturas WebP) traz o libvips pré-compilado para Alpine (musl, x64 e arm64): não precisa de pacotes extra.
FROM node:22-alpine AS base
# Paulo: exiftool (EXIF), rclone (Google Drive) e su-exec (arrancar como utilizador sem privilégios)
RUN apk upgrade --no-cache && apk add --no-cache exiftool rclone ca-certificates tzdata su-exec
WORKDIR /app

# ---------- Desenvolvimento: Vite (5173) + nodemon (3000) no mesmo contentor ----------
FROM base AS dev
COPY backend/package*.json /app/backend/
RUN cd /app/backend && npm ci
COPY frontend/package*.json /app/frontend/
RUN cd /app/frontend && npm ci
# Paulo: em desenvolvimento o contentor continua como root, porque o código vem montado do teu disco
# e o Vite precisa de escrever na sua cache; nada disto vai para produção.
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
RUN npm ci --omit=dev && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn* /usr/local/bin/yarn*
COPY backend/server.js backend/media.js ./
# Falha o build se o sharp não carregar nesta imagem
RUN node -e "const s=require('sharp'); console.log('sharp', s.versions.sharp, 'libvips', s.versions.vips)"
# Os JSON do repositório servem de dados iniciais quando o volume /data está vazio
COPY backend/photos.json backend/collections.json backend/settings.json ./seed/
COPY backend/seed/categories.json ./seed/categories.json
COPY --from=frontend-build /src/dist ./public
COPY scripts/entrypoint.sh /usr/local/bin/pinhality-entrypoint
# Paulo: as pastas dos volumes pertencem ao utilizador node, para que volumes novos já nasçam com o dono certo
RUN chmod 755 /usr/local/bin/pinhality-entrypoint \
 && mkdir -p /data /dados_privados/fotos_gdrive /dados_privados/derivados \
 && chown -R node:node /data /dados_privados
EXPOSE 3000
ENTRYPOINT ["pinhality-entrypoint"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
