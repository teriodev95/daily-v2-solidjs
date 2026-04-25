# Deploy Guide — Daily Check v2

## URLs
- **Frontend**: https://daily-check.pages.dev
- **API (Worker)**: https://daily-check-api.clvrt.workers.dev
- **D1 Database**: `daily-check-db` (ID: `2e9170b0-e0e1-43fc-b1ec-a7d23cb6964d`)
- **Realtime (Centrifugo)**:
  - WS público: `wss://centrifugo.terio.dev/connection/websocket`
  - HTTP API publish: `https://centrifugo-api.terio.dev/api`
  - Documentación operativa: wiki "Centrifugo production realtime"

## Repositorios
- **GitHub**: https://github.com/teriodev95/daily-v2-solidjs (`origin`)
- **Gitea**: https://gitea.terio.dev/terio/daily-v2-solidjs (`gitea`)
- **Referencia API Gitea**: https://gitea.terio.dev/terio/gitea-api-reference

Para agregar el remote de Gitea (si haces clone fresco):
```bash
git remote add gitea https://gitea.terio.dev/terio/daily-v2-solidjs.git
```

Push a ambos:
```bash
git push origin main
git push gitea main
```

---

## Backend (Cloudflare Worker)

```bash
# Deploy worker
npx wrangler deploy

# DB: generar migración tras cambiar schema
npx drizzle-kit generate

# DB: aplicar migración en producción
npx wrangler d1 migrations apply daily-check-db --remote

# DB: ejecutar SQL directo en producción
npx wrangler d1 execute daily-check-db --remote --command "SELECT * FROM users"
```

### Secrets de producción

Configurar una sola vez (o cuando roten). Pega el valor cuando lo pida:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put API_KEY

# Realtime
npx wrangler secret put CENTRIFUGO_API_URL    # https://centrifugo-api.terio.dev/api
npx wrangler secret put CENTRIFUGO_API_KEY    # ver wiki "Centrifugo production realtime"
```

Verificar:
```bash
npx wrangler secret list
```

**Archivos clave:**
- `worker/index.ts` — rutas y middleware
- `worker/routes/*.ts` — endpoints
- `worker/lib/realtime.ts` — publisher Centrifugo (fire-and-forget tras mutaciones)
- `worker/db/schema.ts` — schema Drizzle
- `worker/types.ts` — bindings `Env` (incluye `CENTRIFUGO_API_URL/KEY`)
- `wrangler.toml` — config del worker

---

## Frontend (Cloudflare Pages)

```bash
# Build
npm run build

# Deploy a producción
npx wrangler pages deploy dist/ --project-name daily-check --branch main
```

**Archivos clave:**
- `.env.production` — `VITE_API_URL=https://daily-check-api.clvrt.workers.dev`
- `public/_redirects` — SPA fallback
- `src/v2/lib/api.ts` — cliente API (envía `X-Client-Id` para echo suppression de realtime)
- `src/v2/lib/realtime.ts` — adapter Centrifugo (lazy import, suscripción al canal `team.<id>`)
- `src/v2/lib/activeTab.ts` — signal global del tab activo (evita refetch en pantallas no visibles)

> **Realtime cliente**: la URL del WS está hardcoded en `src/v2/lib/realtime.ts` (`wss://centrifugo.terio.dev/connection/websocket`). Si rota el dominio, edita ahí.

---

## Deploy completo (back + front, en serie)

```bash
npx wrangler deploy \
  && npm run build \
  && npx wrangler pages deploy dist/ --project-name daily-check --branch main
```

---

## Dev local

Crear `.dev.vars` (gitignored) con los secrets locales:

```bash
JWT_SECRET=dev-secret-change-in-production-abc123
API_KEY=<...>
DEEPSEEK_API_KEY=<...>
TOKEN_ENCRYPTION_KEY=<...>
CENTRIFUGO_API_URL=https://centrifugo-api.terio.dev/api
CENTRIFUGO_API_KEY=<ver wiki "Centrifugo production realtime">
```

Levantar dos terminales:

```bash
# Terminal 1 — API (puerto 8787)
npx wrangler dev

# Terminal 2 — Frontend (puerto 3000, proxy automático a 8787)
npm run dev
```

Realtime funciona en local porque el cliente se conecta al WS público de Centrifugo y el worker local publica vía HTTP API con la API key del `.dev.vars`. **No es necesario levantar Centrifugo en local.**

---

## Seed (datos iniciales)

```bash
curl -X POST https://daily-check-api.clvrt.workers.dev/api/admin/seed
```

## Login de prueba
- **Email**: `jesus@daily.dev`
- **Password**: `password123`

---

## Operación de Centrifugo

El servicio corre en `max1` con Docker Compose. Endpoints, credenciales completas y comandos operativos están documentados en la wiki:

- **Wiki en Daily Check** — buscar "Centrifugo production realtime".
- **Health check rápido**: `curl -fsS https://centrifugo-api.terio.dev/health`.
- **Ver clientes conectados**:
  ```bash
  curl -sS -H "X-API-Key: $CENTRIFUGO_API_KEY" -H 'Content-Type: application/json' \
    -d '{"method":"info","params":{}}' https://centrifugo-api.terio.dev/api
  ```

Si Centrifugo se cae, las mutaciones siguen funcionando (publish es best-effort). El cliente reconecta automáticamente; mientras tanto el fallback `visibilitychange`/`focus` mantiene la UI fresca.
