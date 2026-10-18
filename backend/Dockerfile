FROM node:22-alpine
# exiftool para ler os dados das fotos e rclone para sincronizar com o Google Drive
RUN apk add --no-cache exiftool rclone ca-certificates
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Os JSON do repositório servem de dados iniciais quando o volume /data está vazio
RUN mkdir -p /app/seed /data /dados_privados/fotos_gdrive \
 && cp photos.json collections.json categories.json settings.json /app/seed/
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server.js"]
