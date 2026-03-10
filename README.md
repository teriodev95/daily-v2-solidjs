# Daily V2

Gestión de historias de usuario y reportes diarios para equipos.

## Stack

- **Frontend** — SolidJS + TypeScript + Tailwind CSS + DaisyUI
- **Backend** — Cloudflare Workers + Hono + Drizzle ORM
- **Base de datos** — Cloudflare D1 (SQLite)
- **Almacenamiento** — Cloudflare R2 (adjuntos)

## Inicio rápido

```bash
npm install

# Frontend
npm run dev

# Backend
npm run dev:api

# Frontend con URL .localhost estable vía Portless
npm run dev:portless
```

Frontend en `http://localhost:3000` — Backend en `http://localhost:8787`

Con `portless`, el frontend se expone en una URL estable tipo
`http://solidjs-daily-app.localhost:1355` y sigue usando el proxy de Vite
hacia `http://localhost:8787` para `/api`.

## Estructura

```
src/v2/           # App principal (SolidJS)
  pages/          # Dashboard, Proyectos, Reporte, Equipo
  components/     # Modales, detalle HU, adjuntos, búsqueda
  lib/api.ts      # Cliente API

worker/           # API (Cloudflare Workers)
  routes/         # stories, attachments
  db/             # schema, seed
```

## Funcionalidades

- Tablero Kanban con drag & drop
- Creación y edición de historias de usuario
- Reportes diarios interactivos
- Búsqueda global (Cmd+K)
- Menú contextual con acciones rápidas
- Adjuntos con vista previa de imágenes
- Atajos de teclado (I, R, E, P, N)
- Tema claro/oscuro

## Deploy

```bash
# Frontend → Cloudflare Pages
npm run build

# Backend → Cloudflare Workers
npx wrangler deploy
```

## Licencia

MIT
