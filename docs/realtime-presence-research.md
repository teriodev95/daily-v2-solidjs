# Realtime presence — investigación y plan

Investigación de referencia: AFFiNE (`/home/dev/refs/AFFiNE`, shallow clone).
Objetivo: implementar avatares inline que muestren quién está viendo/editando
cada HU y cada tarjeta del tablero, manteniendo el código simple y sin
introducir CRDT/Yjs.

## Hallazgos en AFFiNE

### Backend (`packages/backend/server/src/core/sync/gateway.ts`, 957 LOC)

- Transporte: **Socket.IO**. Cada documento tiene una sala dedicada de
  awareness: `${spaceType}:${spaceId}:${docId}:awareness`.
- Eventos del namespace de presencia:
  - `space:join-awareness` — un cliente entra al room.
  - `space:leave-awareness` — sale.
  - `space:load-awarenesses` — pide el estado actual; el server responde
    emitiendo `space:collect-awareness` a los demás clientes para que
    cada uno publique su propio estado.
  - `space:update-awareness` → broadcasted como
    `space:broadcast-awareness-update`.
- **El servidor NO mantiene estado de awareness**. Es puro broker. La
  lista de clientes activos por sala la lleva Socket.IO internamente.
- Desconexión abrupta: `handleDisconnect()` (línea 342) limpia mapeos
  globales. No hay heartbeat explícito a nivel de awareness; Socket.IO
  cierra la sesión.
- Hay un contador de usuarios activos en memoria que se flush a DB
  cada 60 s, pero es analítica, no awareness.

### Cliente — Awareness engine (`blocksuite/framework/sync/src/awareness/*` + `store/src/yjs/awareness.ts`)

- Estado local típico:
  ```ts
  type RawAwarenessState = {
    user?: { name: string };
    color?: string;
    selectionV2: Record<string, UserSelection>;
  };
  ```
- Usa la primitiva `Awareness` de `y-protocols/awareness`. Funciones
  clave: `setLocalState`, `setLocalStateField`, `getLocalState`,
  `getStates`, `encodeAwarenessUpdate`, `applyAwarenessUpdate`.
- Sin throttle propio: emite en cada cambio del local state. La frecuencia
  la modula el editor que dispara los cambios.
- **TTL implícito**: lo gestiona Yjs-Awareness internamente; AFFiNE no
  añade timeouts ni heartbeats explícitos.
- Estado vivo en memoria: si te desconectas, te pierdes; al reconectar
  se vuelve a publicar.

### Cliente — UI (`blocksuite/affine/widgets/remote-selection/...`)

- Cursor remoto = línea de 2 px posicionada con `_getCursorRect()`.
- Selección remota = lista de divs.
- **Color por usuario**: estable. Se guarda en awareness state y en un
  `EditPropsStore.storage('remoteColor')`. Lo asigna `multiPlayersColor.pick()`.
- Etiqueta con nombre encima del cursor (`<div>${selection.user?.name}</div>`),
  fondo del color del usuario, sombra ligera.
- Throttle de UI: 60 ms entre actualizaciones.
- Sin fade-out explícito: la presencia desaparece cuando el observer
  emite `event.active$ === false`.

## Decisiones de diseño para nuestra app

### Lo que adoptamos de AFFiNE

1. **Server como puro broker**. Calza perfecto con nuestro Centrifugo,
   que ya broadcastea por canal de team. No añadimos estado en el worker.
2. **Color estable por usuario**. Lo derivamos de `user.id` con un hash
   determinista contra una paleta fija (8 colores). Reproducible,
   sin negociación.
3. **Estado de awareness vivo solo en memoria del cliente**. Una hash
   map por scope, sin persistencia.
4. **Sin heartbeats explícitos en el server**: el server reenvía y olvida.

### Lo que NO adoptamos (sobreingeniería para nuestro caso)

1. **Yjs / CRDT**: no estamos haciendo edición concurrente carácter a
   carácter. La detección de conflicto (commit anterior) ya cubre el
   campo `description`. Importar Yjs sólo para presencia es 200 KB
   gratis.
2. **Cursores y selecciones remotas**: no las necesitamos hoy. El valor
   está en saber *quién* está viendo/editando, no *dónde* dentro del
   texto.
3. **`load-awarenesses` request/response entre clientes**: no lo
   exponemos por ahora. Cada cliente publica su heartbeat cada N
   segundos, y los demás aprenden por TTL en lugar de pedir snapshot.
4. **Throttling a 60 ms**: irrelevante para este nivel de granularidad
   (avatares, no cursores). Heartbeat cada 10 s es suficiente.

## Diseño adaptado

### Transporte

Reusamos el canal existente `team.{teamId}` de Centrifugo. Ningún
cambio de infra. Los eventos de presencia son `type: 'presence.*'`:

- `presence.beat` — `{ user_id, scope, mode, ts }`.
- `presence.leave` — `{ user_id, scope }`.

`scope` es una cadena estable, p. ej. `story:abc123` o `board`. `mode`
es `'viewing' | 'editing'`. `ts` epoch ms.

### Server (`worker/routes/presence.ts`, ~30 LOC)

Dos endpoints HTTP autenticados:

- `POST /api/presence/beat` body `{ scope, mode }` → publica
  `presence.beat`.
- `POST /api/presence/leave` body `{ scope }` → publica `presence.leave`.

Sin DB, sin estado. Llama `publish()` y termina.

### Cliente (`src/v2/lib/presence.ts`, ~120 LOC)

Singleton con:

- Mapa `scope → Map<user_id, { mode, expiresAt, lastSeen }>`.
- Suscripción única a `onRealtime` para eventos `presence.*`.
- Recibe `beat` → upsert con `expiresAt = now + 25 s`.
- Recibe `leave` → delete.
- GC cada 5 s borra entradas vencidas.
- API:
  - `usePresence(scope, isActive, mode)` — Solid hook. Emite beat cada
    10 s mientras `isActive()` sea verdadero. Pausa si la pestaña está
    oculta. En cleanup envía `leave`.
  - `presentIn(scope) → Accessor<Entry[]>` — para los componentes que
    quieren leer.

### Cliente — Color (`src/v2/lib/userColor.ts`, ~15 LOC)

Hash determinista (sumar charCodes mod 8) contra paleta de 8 colores
iOS-friendly que combinan con la paleta Tailwind del proyecto.

### Cliente — Componente (`src/v2/components/PresenceAvatars.tsx`, ~80 LOC)

Props: `scope`, `excludeSelf?`, `size?`, `max?`.

Render:
- Stack horizontal de avatares (max 3 visibles + `+N` overflow).
- Si `mode === 'editing'`: ring del color del usuario alrededor del avatar.
- Tooltip nativo con nombre y modo.
- Si `data.getUserById(id)` no resuelve, render con inicial + color.

### Integración

- **StoryDetail / MobileStoryDetail**:
  - `usePresence('story:' + id, () => true, mode)` en `onMount`.
  - `mode` es signal: `'editing'` cuando el usuario tiene foco en
    título o editor; `'viewing'` en otro caso.
  - Banner en el header con `<PresenceAvatars scope=... excludeSelf />`.
- **Kanban Card** (`components/kanban/Card.tsx`):
  - `<PresenceAvatars scope={'story:' + s.id} excludeSelf size="sm" max={2} />`
    superpuesto en la esquina superior derecha de la tarjeta.
  - Sin emisión propia; solo observa. La emisión sucede cuando el modal
    de la HU está abierto en otro cliente.

## Garantías que damos

- Si dos personas abren la misma HU, cada una ve el avatar de la otra
  en el header dentro de 10 s.
- Si la otra persona pone el foco en el editor, su avatar se muestra
  con ring de color (estado "editando").
- Si la otra persona cierra la pestaña sin enviar `leave`, su entrada
  desaparece después de ~25 s por TTL.
- Si la pestaña se oculta, dejamos de pulsar para no gastar ancho de
  banda; otros clientes nos ven desaparecer naturalmente.

## Lo que queda fuera de esta iteración

- Cursores remotos dentro del editor (decisión consciente: no es nuestro
  caso de uso).
- Persistencia de presencia en server (no la necesitamos).
- Auto-scroll a la sección donde el otro está editando.
- Notificaciones tipo "Pedro acaba de abrir tu HU".
