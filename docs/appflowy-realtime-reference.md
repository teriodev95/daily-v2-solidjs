# AppFlowy realtime reference

Referencia base:
- AppFlowy: https://github.com/appflowy-io/appflowy
- AppFlowy-Collab: https://github.com/AppFlowy-IO/AppFlowy-Collab

Snapshot inspeccionado:
- `appflowy-io/appflowy`: `4af02cdc87468be10ab15dbb4afd27fbf53ce89b`
- `AppFlowy-IO/AppFlowy-Collab`: `be5aa89b4aeafd4e7159e92b86784c02caaa85ce`

## Que realtime usa

AppFlowy usa una arquitectura CRDT basada en `yrs`, el port Rust de Yjs. La capa principal se llama `collab` y modela documentos, bases de datos, folders y awareness como objetos colaborativos.

El flujo general es:

1. El usuario edita un documento.
2. `Collab` registra el cambio como una transaccion `yrs`.
3. Plugins locales persisten el cambio, principalmente en RocksDB.
4. Un plugin/cliente de sync envia el update al servidor.
5. El servidor confirma y broadcast a otros clientes por WebSocket.
6. Los otros clientes aplican el update CRDT y refrescan la UI.

## Piezas importantes

- `frontend/rust-lib/Cargo.toml` en AppFlowy declara `yrs` y crates `collab-*`.
- `frontend/rust-lib/flowy-server/src/af_cloud/server.rs` crea `WSClient` y se suscribe a canales de colaboracion por object id con `subscribe_collab(object_id)`.
- `frontend/appflowy_flutter/lib/env/cloud_env.dart` construye el endpoint WebSocket como `/ws/v1`.
- `frontend/appflowy_flutter/lib/shared/feature_flags.dart` tiene flags para `syncDocument` y `syncDatabase`.
- `AppFlowy-Collab/README.md` describe `collab` como capa colaborativa sobre `yrs`.
- `AppFlowy-Collab/docs/architecture.md` documenta el ciclo create/open/edit/sync y menciona broadcast por realtime service WebSocket.

## Implicacion para Daily

La direccion correcta para nuestro modulo realtime es parecida a AppFlowy:

- Mantener el documento como CRDT, no como string markdown plano.
- Persistir updates binarios append-only o snapshots compactados.
- Usar WebSocket solo como transporte de updates y awareness.
- Separar claramente:
  - estado del documento
  - presencia/awareness
  - cache denormalizado para busqueda/kanban
  - reconciliacion en reconnect/hydrate

Nuestro stack actual (`Yjs` en frontend + Worker/D1 + Centrifugo) es conceptualmente compatible con ese modelo. La diferencia es que AppFlowy tiene una capa `collab` mucho mas formal para dominio, plugins, storage local y sync.
