FROM node:22-alpine
# Instalar o exiftool para conseguir ler os dados das fotos
RUN apk add --no-cache exiftool
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
