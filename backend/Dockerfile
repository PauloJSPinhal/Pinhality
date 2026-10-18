FROM node:22-alpine
# Instalar o exiftool para conseguir ler os dados das fotos
# e o rclone para sincronizar com o google drive
RUN apk add --no-cache exiftool rclone ca-certificates
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
