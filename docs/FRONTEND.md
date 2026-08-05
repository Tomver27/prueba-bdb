# FRONTEND.md — Interfaz de consulta

## Requisito funcional clave

Una sola página (`app/page.tsx`), sin recarga entre consultas: el envío de una pregunta y la
visualización de la respuesta ocurren vía `fetch` a `/api/agent` desde un componente cliente, con
estado en React (no hace falta un router de múltiples páginas para este alcance).

## Componentes

### `ChatBox.tsx`
- Campo de texto (textarea) para la pregunta en español.
- Botón "Preguntar", deshabilitado si el campo está vacío o si hay una consulta en curso.
- Al enviar: limpia errores previos, dispara el estado `loading`, hace `POST /api/agent`.
- Permite iniciar una nueva consulta inmediatamente después de recibir una respuesta (el campo se
  limpia pero el historial de la respuesta anterior puede quedar visible hasta la siguiente).

### `AnswerCard.tsx`
- Muestra `answer` como texto principal.
- Si `limitations` no está vacío, se muestra en una sección visualmente distinta (ej. tono
  ámbar/neutro), nunca mezclada con el texto de `answer` para que el usuario distinga claramente
  "esto es lo que se encontró" de "esto no se pudo verificar".
- Si `status` es `"error"`, se delega en `ErrorState` en vez de renderizar una tarjeta de
  respuesta vacía.

### `TracePanel.tsx`
- Lista cada entrada de `sources`: nombre de la herramienta, parámetros usados (ya redactados de
  secretos por el backend), y un resumen corto del dato recibido.
- Colapsable por defecto cerrado o abierto (decisión de UX libre), pero siempre presente cuando
  `sources.length > 0` — es el requisito de trazabilidad del PDF.
- No debe mostrar nunca headers, tokens ni URLs con credenciales, aunque llegaran por error desde
  el backend (defensa en profundidad: filtrar cualquier campo que parezca un secreto antes de
  renderizar).

### `LoadingState.tsx`
- Se muestra mientras `loading === true`. Debe comunicar que el agente está seleccionando y
  consultando herramientas, no solo un spinner genérico (ej. "Consultando fuentes oficiales...").

### `ErrorState.tsx`
- Cubre: pregunta vacía, timeout, error de Croma, error de Gemini, credenciales ausentes
  (mensaje genérico al usuario final, detalle técnico solo en logs del servidor).
- Siempre debe ofrecer poder reintentar sin recargar la página.

## Estados de la UI (máquina simple)

```
idle → loading → (success | no_data | partial | error) → idle (al iniciar nueva consulta)
```

- `success`: `AnswerCard` + `TracePanel` con datos reales.
- `no_data`: `AnswerCard` mostrando explícitamente que no se encontró información (no es un
  error de la aplicación).
- `partial`: `AnswerCard` con lo que sí se obtuvo + `limitations` visibles.
- `error`: `ErrorState`.

## Fuera de alcance (documentar como decisión, no como pendiente accidental)

- No hay autenticación de usuarios ni historial persistente entre sesiones — no lo pide el PDF y
  añadiría superficie innecesaria para un reto de 1 día.
- No hay streaming de la respuesta token a token; se espera la respuesta completa del agente y se
  renderiza de una vez (simplifica el manejo de estado del lado del backend con el loop de tools).
