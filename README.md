# KulturPulse Berlin

Berlin cultural events radar — a full-stack, edge-first web app.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router, RSC) on Vercel |
| API + ETL | Cloudflare Worker (Hono v4) |
| Database | Cloudflare D1 (SQLite at the edge) |
| AI chat | Cloudflare Workers AI — `llama-3.1-8b-instruct` |
| Data source | [Berlin Kulturdaten API](https://api-v2.kulturdaten.berlin/api) |
| Geocoding | [Photon / Komoot](https://photon.komoot.io) |

## Project Structure

```
kulturpulse-berlin/
├── apps/
│   └── web/                  # Next.js 15 frontend
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx      # Server component, ISR every 5 min
│       │   ├── globals.css
│       │   └── api/chat/     # Proxies to Worker
│       ├── components/
│       │   ├── KulturPulseApp.tsx  # Main client shell
│       │   ├── BerlinMap.tsx       # Leaflet map (client-only)
│       │   ├── EventCard.tsx       # Individual event row
│       │   └── ChatPanel.tsx       # AI chat FAB
│       └── lib/
│           ├── api.ts         # fetchEvents()
│           ├── types.ts       # Shared TypeScript types
│           └── utils.ts       # Formatting + category helpers
└── worker/                   # Cloudflare Worker
    ├── schema.sql             # D1 table definitions
    ├── wrangler.toml
    └── src/
        ├── index.ts           # Hono routes
        ├── db.ts              # D1 queries
        ├── ingest.ts          # ETL from kulturdaten.berlin
        ├── geocoder.ts        # Photon geocoding + D1 cache
        └── types.ts           # Env, EventRow, etc.
```

## Local Development

### 1. Worker

```bash
cd worker
npm install

# Create local D1 database
npx wrangler d1 create kulturpulse-db          # copy the id into wrangler.toml
npx wrangler d1 execute kulturpulse-db --local --file ./schema.sql

# Copy secrets to local dev vars
cp .dev.vars.example .dev.vars
# edit .dev.vars with your INGEST_SECRET

npm run dev     # starts on http://localhost:8787
```

### 2. Web app

```bash
cd apps/web
npm install

# Create .env.local
echo "WORKER_API_URL=http://localhost:8787" > .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8787" >> .env.local

npm run dev     # starts on http://localhost:3000
```

### 3. Seed data (first run)

```bash
curl -X POST http://localhost:8787/api/ingest \
  -H "Authorization: Bearer your-ingest-secret"
```

## Deployment

### Cloudflare Worker

```bash
cd worker

# One-time setup
npx wrangler d1 create kulturpulse-db
npx wrangler d1 execute kulturpulse-db --remote --file ./schema.sql
npx wrangler secret put INGEST_SECRET
npx wrangler secret put ALLOWED_ORIGIN

npx wrangler deploy
```

### Vercel (web app)

```bash
cd apps/web
npx vercel --prod
# Set WORKER_API_URL and NEXT_PUBLIC_API_URL in Vercel dashboard
```

### GitHub Actions (CI/CD)

Set the following secrets in your GitHub repo (`Settings → Secrets → Actions`):

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare token with Worker + D1 edit |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `WORKER_API_URL` | Worker production URL |
| `NEXT_PUBLIC_API_URL` | Worker production URL (public) |
| `VERCEL_TOKEN` | Vercel personal access token |
| `VERCEL_ORG_ID` | From `vercel link` |
| `VERCEL_PROJECT_ID` | From `vercel link` |

Pushes to `main` that touch `worker/**` trigger the Worker deploy pipeline; pushes that touch `apps/web/**` trigger the Vercel pipeline.

## API Reference

### `GET /api/events`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `date` | ISO string | today | Filter by date |
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Results per page (max 200) |
| `price` | `free\|paid` | — | Price filter |
| `category` | string | — | Category filter |

### `POST /api/chat`

```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "date": "2025-06-01"
}
```

Returns `{ "response": "..." }`.

### `POST /api/ingest` (protected)

```
Authorization: Bearer <INGEST_SECRET>
```

Triggers a full ETL sync from kulturdaten.berlin. Also runs automatically every 6 hours via Cloudflare Cron Triggers.

## License

MIT
