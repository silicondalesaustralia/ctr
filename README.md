# AU SERP Behaviour Experiment Platform

Controlled research platform for testing whether Australian Google Search-originated visits across related query clusters are associated with measurable Search Console visibility changes.

## Stack

- Node.js + TypeScript
- Playwright
- GoLogin / Mock browser profiles
- Decodo / Mock proxies
- PostgreSQL + Prisma
- BullMQ + Redis
- Express admin API
- Next.js dashboard

## Quick start

```bash
docker compose up -d
cp .env.example .env
npm install
npm run db:generate
npm run db:push
npm run experiment:create -- ./experiments/test-001.yml
npm run identities:create -- --count 10
DRY_RUN=true npm run session:test -- --identity au_001 --query "sell eggs from home"
npm run api
npm run dashboard:dev
```

## Safety

This platform does not bypass CAPTCHA, use stealth plugins, or automate evasion. Blocked Google sessions stop immediately and are logged for review.

## Commands

- `npm run identities:create -- --count 100`
- `npm run identities:validate`
- `npm run experiment:create -- ./experiments/test-001.yml`
- `npm run schedule:generate -- --experiment test-001`
- `DRY_RUN=true npm run session:test -- --identity au_001 --query "sell eggs from home"`
- `npm run worker`
- `npm run gsc:import -- --experiment test-001 --file ./fixtures/sample-gsc.csv`
- `npm run experiment:analyse -- --experiment test-001`

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel (dashboard) + Railway/Render (API/worker) setup.

See the build specification for the full experiment design, scheduling model, measurement approach, and acceptance criteria.
