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

ENV NODE_ENV=production
EXPOSE 8080

# Default: run API. Override CMD for worker, e.g. npm run worker
CMD ["npm", "run", "api"]
