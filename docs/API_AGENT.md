# Daily Check API — Guía para Agentes

**Base URL**: `https://daily-check-api.clvrt.workers.dev`

**Auth**: `Authorization: Bearer d4f37158be20bbe846b7763ad9ad3875c291effa7ad8d8af8d28b9ad29385dec`

---

## Descubrimiento

```
GET /api/meta
```

Devuelve valores válidos para prioridades, estados, frecuencias y endpoints disponibles.

---

## Stories (tareas/HUs)

### Listar

```
GET /api/stories?limit=50&offset=0
GET /api/stories?status=todo
GET /api/stories?assignee_id=<user_id>
GET /api/stories?project_id=<project_id>
```

Respuesta paginada (con `limit`/`offset`):
```json
{ "data": [...], "total": 42, "limit": 50, "offset": 0 }
```

### Crear

```
POST /api/stories
Content-Type: application/json

{
  "title": "Implementar feature X",         // requerido
  "description": "Detalles en **markdown**", // opcional
  "priority": "high",                        // low | medium | high | critical
  "status": "todo",                          // backlog | todo | in_progress | done
  "assignee_id": "<user_id>",               // opcional
  "project_id": "<project_id>",             // opcional
  "due_date": "2026-04-10",                 // opcional, YYYY-MM-DD
  "estimate": 3                              // opcional, numérico
}
```

### Obtener

```
GET /api/stories/<id>
```

Incluye `criteria` y `assignees`.

### Actualizar

```
PATCH /api/stories/<id>
Content-Type: application/json

{ "status": "done", "description": "Actualizado" }
```

### Eliminar

```
DELETE /api/stories/<id>
```

---

## Adjuntos

### Listar por story

```
GET /api/attachments/story/<story_id>
```

### Subir archivo (max 10MB)

```
POST /api/attachments/story/<story_id>
Content-Type: multipart/form-data

file: <archivo>
```

### Descargar

```
GET /api/attachments/file/<attachment_id>
```

### Eliminar

```
DELETE /api/attachments/<attachment_id>
```

---

## Wiki (knowledge base por proyecto)

### Listar artículos

```
GET /api/wiki?project_id=<project_id>
GET /api/wiki?project_id=<project_id>&tag=prompt
```

### Crear artículo

```
POST /api/wiki
{ "project_id": "p1", "title": "Deploy guide", "content": "# Steps...", "tags": ["deploy", "ops"] }
```

### Obtener / Actualizar / Eliminar

```
GET    /api/wiki/<id>
PATCH  /api/wiki/<id>    { "content": "updated...", "tags": ["new"] }
DELETE /api/wiki/<id>
```

### Resolver por título (navegar [[wiki links]])

```
GET /api/wiki/resolve?title=Deploy%20guide&project_id=p1
→ artículo completo o 404
```

### Links de un artículo (outgoing + incoming)

```
GET /api/wiki/<id>/links
→ { "outgoing": [{ "id", "title" }], "incoming": [{ "id", "title" }] }
```

### Batch (múltiples artículos en 1 call)

```
POST /api/wiki/batch
{ "ids": ["id1", "id2", "id3"] }
→ [artículo, artículo, artículo]
```

### Buscar (con snippet de contexto)

```
GET /api/wiki/search?q=deploy&project_id=p1
→ [{ id, title, tags, snippet: "...paso a paso para deploy..." }]
```

### Grafo de conexiones

```
GET /api/wiki/graph?project_id=p1
→ { "nodes": [{ id, name, tags }], "links": [{ source, target }] }
```

---

## Consultas auxiliares

```
GET /api/projects          → lista de proyectos (id, name, prefix, color)
GET /api/team/members      → lista de usuarios (id, name, email, role)
```

---

## Errores

```json
{ "error": "title is required", "field": "title" }
```

| Código | Significado |
|--------|-------------|
| 400 | Validación fallida |
| 401 | API key inválida o ausente |
| 404 | Recurso no encontrado |

---

## Ejemplo rápido

```bash
curl -H "Authorization: Bearer d4f37158be20bbe846b7763ad9ad3875c291effa7ad8d8af8d28b9ad29385dec" \
  https://daily-check-api.clvrt.workers.dev/api/meta
```
