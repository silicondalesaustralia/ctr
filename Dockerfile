FROM mcr.microsoft.com/playwright:v1.51.0-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY fixtures ./fixtures
COPY config ./config
COPY experiments ./experiments

RUN chmod +x scripts/railway-start.sh

ENV NODE_ENV=production
ENV GOLOGIN_BROWSER_RUNTIME=orbita
EXPOSE 8080

CMD ["bash", "scripts/railway-start.sh"]
