# Deployment guide

This platform has **two parts** with different hosting requirements.

## What runs where

| Component | Recommended host | Why |
|-----------|------------------|-----|
| **Dashboard** (`dashboard/`) | **Vercel** | Next.js UI, short HTTP requests |
| **Admin API** (`npm run api`) | **Railway**, **Render**, or **Fly.io** | Express + DB access |
| **Session worker** (`npm run worker`) | Same as API (separate service/process) | Playwright + BullMQ, long-running |
| **PostgreSQL** | **Neon**, **Supabase**, or **Railway Postgres** | Managed Postgres |
| **Redis** | **Upstash Redis** or **Railway Redis** | BullMQ job queue |

**Do not expect Vercel alone to run browser sessions.** Playwright sessions take 1–3+ minutes, need a full browser, and are a poor fit for serverless timeouts.

## 1. Git + GitHub

```bash
cd /Users/jonosmmachine/Documents/Cursor/CTR
git init
git add .
git commit -m "Initial AU SERP experiment platform"
gh repo create CTR --private --source=. --push
```

## 2. Managed database + Redis

Create:

1. **Neon** (or Supabase) Postgres → copy `DATABASE_URL`
2. **Upstash** Redis → copy `REDIS_URL`

Apply schema:

```bash
DATABASE_URL="postgresql://..." npx prisma db push
```

## 3. Deploy API + worker (Railway example)

Create two services from the same repo using `Dockerfile`:

**Service A — API**
- Start command: `npm run api`
- Env: `DATABASE_URL` (or Neon `POSTGRES_PRISMA_URL`), `REDIS_URL`, `ADMIN_API_KEY`, provider secrets, `EXPERIMENT_RUNNER_ENABLED=true`
- Railway sets `PORT` automatically — the API listens on that port

**Service B — Worker**
- Start command: `npm run worker`
- Same env as API

Use the Playwright Docker image (included in `Dockerfile`).

## 4. Deploy dashboard to Vercel

**Important:** Set **Root Directory** to `dashboard` in Vercel → Project → Settings → General.

Alternatively, the repo root `vercel.json` builds the dashboard subfolder automatically.

In Vercel project settings:

- **Root directory:** `dashboard`
- **Environment variables:**
  - `NEXT_PUBLIC_API_URL` = your Railway API URL (e.g. `https://ctr-api.up.railway.app`)
  - `NEXT_PUBLIC_API_KEY` = same as `ADMIN_API_KEY` on the API

Connect the GitHub repo and deploy.

CLI alternative:

```bash
cd dashboard
npx vercel --prod
```

## 5. Production environment variables

Set on API + worker (not on Vercel unless proxied through Next.js):

```bash
DATABASE_URL=
REDIS_URL=
ADMIN_API_KEY=
API_PORT=3001
EXPERIMENT_RUNNER_ENABLED=true
DRY_RUN=false
BROWSER_PROFILE_PROVIDER=gologin
PROXY_PROVIDER=decodo
GOLOGIN_API_TOKEN=
DECODO_PROXY_HOST=
DECODO_PROXY_PORT=
DECODO_PROXY_USERNAME=
DECODO_PROXY_PASSWORD=
GSC_CLIENT_ID=
GSC_CLIENT_SECRET=
GSC_REFRESH_TOKEN=
GA4_PROPERTY_ID=
```

## 6. Auto-deploy (GitHub → Railway)

Both Railway services (`ctr`, `worker`) should be linked to `silicondalesaustralia/ctr` on branch `main`.

**Why deploys sometimes stalled:** `.github/workflows/railway-deploy.yml` used to skip its only job when `RAILWAY_TOKEN` was missing. GitHub then reported **failure / No jobs were run**, and Railway **Wait for CI** blocked the native GitHub deploy — so you had to click Deploy manually.

The workflow now always runs a job (success even without the token). Optional CLI deploy:

1. Railway → Project → Settings → Tokens → create a **project token**
2. GitHub repo → Settings → Secrets and variables → Actions → New secret  
   `RAILWAY_TOKEN` = that token
3. Optional variables (defaults are fine): `RAILWAY_SERVICE_NAME=ctr`, `RAILWAY_WORKER_SERVICE_NAME=worker`

In each Railway service → Settings → Networking / Source: confirm **Wait for CI** is on only if you want Actions to gate deploys (this workflow must stay green).

## 7. After deploy

```bash
npm run experiment:create -- ./experiments/test-001.yml
npm run identities:create -- --count 50
npm run schedule:generate -- --experiment test-001
```

Monitor via dashboard + logs. Keep `EXPERIMENT_RUNNER_ENABLED=false` until manual validation passes.
