# Deploy Guide — Daily Check v2

## URLs
- **Frontend**: https://daily-check.pages.dev
- **API (Worker)**: https://daily-check-api.clvrt.workers.dev
- **D1 Database**: `daily-check-db` (ID: `2e9170b0-e0e1-43fc-b1ec-a7d23cb6964d`)

## Backend (Cloudflare Worker)

```bash
cd solidjs-daily-app

# Deploy worker
npx wrangler deploy

# DB: generar migración tras cambiar schema
npx drizzle-kit generate

# DB: aplicar migración en producción
npx wrangler d1 migrations apply daily-check-db --remote

# DB: ejecutar SQL directo en producción
npx wrangler d1 execute daily-check-db --remote --command "SELECT * FROM users"

# Secrets
npx wrangler secret put JWT_SECRET
```

**Archivos clave:**
- `worker/index.ts` — rutas y middleware
- `worker/routes/*.ts` — endpoints
- `worker/db/schema.ts` — schema Drizzle
- `wrangler.toml` — config del worker

## Frontend (Cloudflare Pages)

```bash
cd solidjs-daily-app

# Build
npm run build

# Deploy a producción
npx wrangler pages deploy dist/ --project-name daily-check --branch main
```

**Archivos clave:**
- `.env.production` — `VITE_API_URL=https://daily-check-api.clvrt.workers.dev`
- `public/_redirects` — SPA fallback
- `src/v2/lib/api.ts` — cliente API

## Deploy Completo (back + front)

```bash
cd solidjs-daily-app
npx wrangler deploy && npm run build && npx wrangler pages deploy dist/ --project-name daily-check --branch main
```

## Dev Local

```bash
# Terminal 1: API
npx wrangler dev

# Terminal 2: Frontend (proxy automático a localhost:8787)
npm run dev
```

## Seed (datos iniciales)

```bash
curl -X POST https://daily-check-api.clvrt.workers.dev/api/admin/seed
```

## Login de prueba
- **Email**: `jesus@daily.dev`
- **Password**: `password123`
