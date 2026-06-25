# Módulo Secretos (vault interno)

Vault simple por equipo para guardar secretos (claves, tokens, credenciales) cifrados.

## Qué es
- Almacén interno del equipo, cifrado con **AES-256-GCM** (mismo primitivo que los PATs, en `worker/lib/aesGcm.ts`).
- El valor solo se descifra en el endpoint de **reveal**; nunca aparece en listados, `GET`, errores ni logs.
- Auditable: cada acción (creado, actualizado, revelado, borrado, cambio de proyecto/tags) deja un evento append-only en `secret_audit_events`.
- Borrado **suave** (`revoked_at`) para preservar el historial.
- **No reemplaza a Infisical** ni a un gestor de secretos de producción: es una conveniencia para el equipo, no infraestructura de secretos de runtime.

## Permisos
- Requiere usuario **admin** (sesión por cookie) o un **PAT** con scope `secrets`.
- El **API_KEY global legacy** está prohibido en `/api/secrets/*` (devuelve `global_api_key_forbidden_for_secrets`).
- `reveal` es `POST`, así que exige `secrets:write`: un PAT con `secrets:read` puede ver metadata y auditoría pero **no** revelar valores.

## Configuración
- Llave de cifrado: `SECRETS_ENCRYPTION_KEY` (64 hex chars / 32 bytes). Genera con `openssl rand -hex 32`.
  - Local: `.dev.vars`. Producción: `wrangler secret put SECRETS_ENCRYPTION_KEY` (ver `DEPLOY.md`).

## Fuente canónica de capacidades
`GET /api/meta` es la fuente de verdad. Cuando el token tiene scope `secrets`, expone `capabilities.secrets` con el nivel concedido (`read`/`write`) y los endpoints de metadata, reveal y auditoría.
