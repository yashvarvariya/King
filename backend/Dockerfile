FROM node:20-alpine

# docker CLI not required (we talk to the socket via dockerode), but
# openssl is needed by Prisma's query engine on alpine.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
