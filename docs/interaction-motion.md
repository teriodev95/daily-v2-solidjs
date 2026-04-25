# Interaction Motion

Daily Check usa `InteractionMotionController` para microinteracciones de éxito en escritorio. El objetivo es dar confirmación visual sin convertir cada acción en una celebración pesada.

## Contrato

- Archivo: `src/v2/lib/interactionMotion.ts`.
- API:
  - `interactionMotion.mountDock(element)` registra el dock desktop y devuelve un cleanup.
  - `playInteractionSuccess({ source, tone })` dispara una ola/glow local sobre el dock.
  - `interactionMotion.dispose()` limpia overlays y timers.
- Tonos:
  - `success`: verde sutil para completar tareas/HUs.
  - `theme`: azul/neutro para cambio de tema.

## Cuándo Usarlo

Usar `playInteractionSuccess` solo para acciones locales del usuario que confirman una intención clara:

```ts
playInteractionSuccess({ source: 'report', tone: 'success' });
playInteractionSuccess({ source: 'kanban', tone: 'success' });
playInteractionSuccess({ source: 'detail', tone: 'success' });
playInteractionSuccess({ source: 'theme', tone: 'theme' });
```

No usarlo para eventos realtime recibidos, refetches, cambios remotos, estados de carga, errores o acciones automáticas. La misma acción no debe disparar más de una ola.

## Cambio de Tema

El cambio light/dark usa `toggleTheme({ animate: true, trigger })`. Esta función usa View Transition API con un clip radial desde el botón de tema para que el cambio de color no sea brusco.

Si el navegador no soporta View Transition API, o si el usuario tiene `prefers-reduced-motion: reduce`, el tema cambia sin animación.

## Accesibilidad y Performance

- No anima en mobile: `min-width: 640px`.
- Respeta `prefers-reduced-motion: reduce`.
- El overlay usa `pointer-events: none`, no recibe foco y no bloquea clicks.
- La animación solo toca `transform`, `opacity` y `filter`; no debe modificar layout.
- La duración objetivo es corta: `420ms` con `cubic-bezier(0.22, 1, 0.36, 1)`.

## Referencia

La referencia visual viene de `react-theme-switch-animation`, pero no se instala ni se copia la librería porque el proyecto usa Solid. Se replica el principio de progressive enhancement: animar cuando el navegador y preferencias lo permiten, y hacer fallback silencioso cuando no.
