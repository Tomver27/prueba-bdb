# FRONTEND.md — Interfaz de consulta

## Requisito funcional clave

Una sola página (`app/page.tsx`), sin recarga entre consultas: el envío de una pregunta y la
visualización de la respuesta ocurren vía `fetch` a `/api/agent` desde un componente cliente, con
estado en React (no hace falta un router de múltiples páginas para este alcance).

## Componentes

### `PageLoader.tsx` (agregado en fase e, feedback de usuario)
- No estaba en el diseño original de este documento. Animación de carga de pantalla completa que
  se muestra una sola vez al cargar la app (título + barra de progreso + contador numérico, luego
  desliza hacia arriba para revelar la página) — inspirada en el `Preloader.tsx` de otro proyecto
  del usuario (`macarena-en-movimiento`, que usa GSAP), pero reimplementada con
  `requestAnimationFrame` + CSS transitions en vez de GSAP para no sumar una dependencia nueva a
  este proyecto (ver `docs/BACKEND.md`/reglas del repo sobre no instalar dependencias sin pedirlo).
  `app/page.tsx` la controla con un simple `showLoader` state, sin persistencia entre recargas.

### `ChatMessage.tsx` (agregado en fase e, feedback de usuario)
- No estaba en el diseño original de este documento. Representa **un turno de la conversación**:
  la pregunta del usuario (burbuja alineada a la derecha) + la respuesta del agente (izquierda,
  usando `LoadingState`/`ErrorState`/`AnswerCard`+`TracePanel` según el estado de ese turno).
- `app/page.tsx` mantiene un array de `Exchange[]` (tipo definido en este mismo archivo, no en
  `lib/types/agent.ts` porque es puramente estado de UI, no parte del contrato con el backend) y
  renderiza un `ChatMessage` por cada uno — así las respuestas anteriores quedan visibles
  apiladas, como una conversación de chat, en vez de reemplazarse por la última.
- **Importante:** esto es solo historial visual dentro de la sesión del navegador (se pierde al
  recargar). El agente **no tiene memoria conversacional real** — cada pregunta sigue siendo una
  llamada independiente y sin contexto a `POST /api/agent` (el orchestrator arranca `contents`
  desde cero por pregunta, ver `docs/AGENT_GEMINI.md`). Preguntas de seguimiento tipo "¿y esa
  empresa qué...?" no van a funcionar — el usuario debe repetir el contexto necesario en cada
  pregunta.

### `ChatBox.tsx`
- Campo de texto (textarea) para la pregunta en español.
- Botón "Preguntar", deshabilitado si el campo está vacío o si **cualquier** consulta está en
  curso (no se permiten envíos concurrentes — protege la cuota gratuita de Gemini, ver
  `docs/AGENT_GEMINI.md`).
- Al enviar: agrega un nuevo `Exchange` en estado `loading` al final del historial, hace
  `POST /api/agent`, limpia el campo de texto.
- **Se renderiza como footer fijo en la parte inferior de la pantalla** (`position: sticky`/`fixed`
  vía `app/page.tsx`), no como parte del flujo de scroll — igual que un chat típico. El área de
  mensajes (`<main>`) es la que scrollea, con auto-scroll al último mensaje en cada cambio del
  historial.

### `AnswerCard.tsx`
- Muestra `answer` como texto principal.
- **Renderizado de markdown simple** (corrección fase e — el usuario reportó que los `**texto**`
  de Gemini se mostraban literales, sin negrita): `answer` se procesa con un mini-parser propio
  (`renderMarkdownLite` dentro del mismo archivo) que soporta **negrita** (`**texto**`) y listas
  (`-`/`*`/`1.`) — no se agregó una librería de markdown (`react-markdown` u otra) para no sumar
  una dependencia nueva; el system prompt (ver `docs/AGENT_GEMINI.md`) restringe a Gemini a usar
  solo ese subconjunto. Si en el futuro se necesita markdown más rico (tablas, encabezados, código),
  hay que evaluar sumar una librería real.
- **Efecto de escritura palabra por palabra** (agregado en fase e, feedback de usuario): el texto
  se revela progresivamente con un `setInterval` client-side, con duración total acotada (~1.4s)
  sin importar el largo de la respuesta. Esto **no es streaming real** — la respuesta ya llegó
  completa del backend (ver "Fuera de alcance" abajo, que sigue vigente sin cambios); es un
  efecto puramente visual sobre datos que ya están completos, se ejecuta una sola vez por
  respuesta. La caja de `limitations` hace fade-in recién cuando termina de "escribirse" el texto
  principal.
- Si `limitations` no está vacío, se muestra en una sección visualmente distinta (ej. tono
  ámbar/neutro), nunca mezclada con el texto de `answer` para que el usuario distinga claramente
  "esto es lo que se encontró" de "esto no se pudo verificar".
- Si `status` es `"error"`, se delega en `ErrorState` en vez de renderizar una tarjeta de
  respuesta vacía. (La lógica de este branching vive en `ChatMessage.tsx`, no dentro de
  `AnswerCard.tsx` — decisión tomada en fase e para mantener `AnswerCard` enfocado solo en
  presentar una respuesta exitosa/parcial/sin datos.)

### `TracePanel.tsx`
- Lista cada entrada de `sources`: nombre de la herramienta, parámetros usados (ya redactados de
  secretos por el backend), y un resumen corto del dato recibido.
- Colapsable por defecto cerrado o abierto (decisión de UX libre), pero siempre presente cuando
  `sources.length > 0` — es el requisito de trazabilidad del PDF.
- No debe mostrar nunca headers, tokens ni URLs con credenciales, aunque llegaran por error desde
  el backend (defensa en profundidad: filtrar cualquier campo que parezca un secreto antes de
  renderizar).

### `LoadingState.tsx`
- Se muestra mientras el turno correspondiente está en `loading`. Debe comunicar que el agente
  está seleccionando y consultando herramientas, no solo un spinner genérico (ej. "Consultando
  fuentes oficiales..."). Indicador visual: 3 puntos con rebote escalonado (estilo "escribiendo"
  de apps de chat), agregado en fase e a pedido del usuario ("animación más llamativa") en vez
  del spinner circular original.

### `ErrorState.tsx`
- Cubre: pregunta vacía, timeout, error de Croma, error de Gemini, credenciales ausentes
  (mensaje genérico al usuario final, detalle técnico solo en logs del servidor).
- Siempre debe ofrecer poder reintentar sin recargar la página.

## Estados de la UI (máquina simple, por turno)

**Corrección (fase e):** esta máquina de estados aplica **por cada `Exchange` individual**, no
de forma global a toda la página — el historial de turnos anteriores permanece visible mientras
un turno nuevo transiciona por su propio ciclo:

```
loading → (done con status ok/partial/no_data → AnswerCard+TracePanel |
           done con status error / network-error → ErrorState)
```

(No hay transición de vuelta a "idle": cada turno, una vez resuelto, queda fijo en el historial.
"idle" solo describe la página completa antes de la primera pregunta.)

- `ok`: `AnswerCard` + `TracePanel` con datos reales.
- `no_data`: `AnswerCard` mostrando explícitamente que no se encontró información (no es un
  error de la aplicación).
- `partial`: `AnswerCard` con lo que sí se obtuvo + `limitations` visibles.
- `error` (del `AgentResponse`) o `network-error` (fallo de `fetch`, no llegó a haber respuesta
  del backend): `ErrorState`.

## Fuera de alcance (documentar como decisión, no como pendiente accidental)

- No hay autenticación de usuarios. El historial de turnos que se ve en pantalla (fase e) es
  únicamente estado de React en el navegador — no se persiste en ningún backend/base de datos y
  se pierde al recargar la página; **tampoco implica memoria conversacional del agente** (ver
  `ChatMessage.tsx` arriba). Si se pidiera memoria conversacional real o historial persistido
  entre sesiones, es un cambio de arquitectura más grande (contrato de `/api/agent`, orchestrator,
  `docs/TRACEABILITY.md`) — no implementado, fuera del alcance de 1 día.
- No hay streaming real (SSE/chunked) de la respuesta token a token desde el servidor; se espera
  la respuesta completa del agente y se renderiza de una vez (simplifica el manejo de estado del
  lado del backend con el loop de tools). **Aclaración (fase e):** sí hay un efecto de "escritura"
  palabra por palabra en `AnswerCard.tsx`, pero es enteramente client-side sobre una respuesta ya
  completa — no cambia esta decisión de arquitectura del backend.
