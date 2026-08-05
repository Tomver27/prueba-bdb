# AGENT_GEMINI.md — Diseño del agente

## Modelo

- Proveedor: **Gemini API**, nivel gratuito (Google AI Studio).
- El nombre exacto del modelo (p. ej. familia `gemini-2.x-flash`) debe verificarse en la consola
  de Google AI Studio al momento de implementar — la disponibilidad del tier gratuito cambia con
  el tiempo. Requisito no negociable: el modelo elegido debe soportar **function calling /
  tool use** nativo (declaración de funciones con JSON Schema).
- **Historial de verificación contra la API real** (`lib/agent/gemini-client.ts::GEMINI_MODEL`,
  fases c/d, 2026-08-05) — se usa el alias `gemini-flash-lite-latest`, no una versión fija:
  - `gemini-2.5-flash` / `gemini-2.5-flash-lite`: 404, ya no disponibles para cuentas nuevas.
  - `gemini-flash-latest`: funciona, pero resuelve a `gemini-3.6-flash`, cuyo free tier tiene un
    límite de solo **20 requests/día por proyecto** — se agotó durante las pruebas de fase d con
    un puñado de llamadas manuales, así que es inviable incluso para desarrollo, no solo para
    producción.
  - `gemini-flash-lite-latest`: funciona, soporta function calling, y en la práctica tiene más
    margen de cuota gratuita — es el que queda configurado por defecto.
  - Si esto vuelve a fallar (Google reasigna los alias con el tiempo), volver a correr el
    listado de modelos (`ai.models.list()`) contra la key real y probar candidatos por REST antes
    de asumir cuál está disponible.
- La API key vive únicamente en el backend (`GEMINI_API_KEY`), nunca llega al cliente.

## Responsabilidad del agente

1. Interpretar la pregunta en español del usuario.
2. Decidir si alguna herramienta disponible puede responderla; si ninguna aplica, debe decirlo
   explícitamente en `answer` y no inventar un resultado.
3. Si aplica una herramienta, generar los parámetros de la llamada a partir del texto del usuario
   (ej. extraer un NIT o un nombre de empresa).
4. Ejecutar la(s) herramienta(s) (puede encadenar: primero buscar, luego pedir detalle de un
   resultado concreto).
5. Redactar una respuesta final en español basada **únicamente** en los datos devueltos por las
   herramientas — nunca en conocimiento paramétrico del modelo sobre la entidad en cuestión.
6. Distinguir explícitamente hechos (vienen del dato crudo) de inferencias simples (ej. "esto
   sugiere que..."), y marcar cualquier limitación (dato no encontrado, fuente parcial, etc.).

## System prompt — lineamientos de contenido

El prompt del sistema (definido en `lib/agent/system-prompt.ts`) debe establecer, como mínimo:

- Idioma de respuesta: español.
- Prohibición explícita de afirmar datos que no provengan de una respuesta de herramienta.
- Instrucción de usar la herramienta de búsqueda antes que la de detalle cuando el usuario da un
  nombre en vez de un identificador exacto (NIT).
- **Refinamiento de términos de búsqueda (feedback de usuario, mismo día que fase e):** si el
  nombre que da el usuario es coloquial o una marca conocida ("exito", "aval", "bavaria"), el
  modelo debe usar su conocimiento general de empresas colombianas para elegir un término más
  cercano a la razón social legal real (ej. "Almacenes Exito" en vez de "exito") **antes** de la
  primera llamada a la herramienta, en vez de mandar el texto del usuario literal. Esto no viola
  la regla de "no afirmar datos sin herramienta": es una decisión de qué parámetro mandar, no una
  afirmación sobre la entidad — el dato que se le muestra al usuario sigue viniendo 100% de la
  respuesta real de la tool. Verificado contra la API real: la pregunta "Dame información de
  exito" resultó en `buscar_entidad_rues({"name": "Almacenes Exito"})`, no `{"name": "exito"}`.
- **Resumen de resultados siempre visible:** si `buscar_entidad_rues` devuelve más de un
  resultado (capped o no), la respuesta final debe cerrar con los 2-5 resultados más relevantes
  (razón social, NIT, ciudad, estado), aunque también se haya dado el detalle de uno en
  particular — no elegir "el más probable" en silencio.
- Instrucción de reportar `found: false` o listas vacías como "no se encontró información", no
  como error.
- Instrucción de formato: markdown simple (negrita `**texto**` + listas con `-`), sin tablas ni
  encabezados — es el subconjunto que `components/AnswerCard.tsx` sabe renderizar (ver
  `docs/FRONTEND.md`); cualquier otra sintaxis de markdown se muestra como texto literal.
- Instrucción de no revelar claves, headers de autenticación ni URLs internas en la respuesta al
  usuario.
- Límite de herramientas encadenadas por turno (ver "Guardrails" abajo).

## Loop de function calling (spec, no código)

```
1. orchestrator.run(question):
2.   mensajes = [system_prompt, user(question)]
3.   loop hasta max_iterations (sugerido: 4):
4.     respuesta = gemini.generateContent(mensajes, tools=tool_registry.declarations)
5.     si respuesta trae function_call:
6.       validar params contra el schema de la tool (lib/tools/*)
7.       si params inválidos → devolver function_response con error de validación (no llamar a Croma)
8.       ejecutar tool.execute(params) → { ok, data | error, trace }
9.       agregar function_response a mensajes
10.      registrar trace en la lista de "sources" de la respuesta final
11.      continuar loop (el modelo puede pedir otra tool, ej. detalle tras búsqueda)
12.    si respuesta trae texto final (sin function_call):
13.      salir del loop con ese texto como `answer`
14.  si se alcanza max_iterations sin texto final:
15.    devolver status "error" con limitación explicando que el agente no pudo concluir
16.  construir AgentResponse { answer, sources: trace[], limitations, status } (ver TRACEABILITY.md)
```

## Guardrails

- **Máximo 4 llamadas a herramientas por pregunta** (evita loops costosos con el free tier).
- **Timeout global del turno**: 30s (más margen que el timeout individual de Croma, ver
  BACKEND.md), tras el cual se responde `status: "error"` con limitación de tiempo de espera.
  **Nota operativa (verificado en fases c/d contra la API real, free tier):** cada llamada a
  `generateContent` puede tomar varios segundos; una pregunta que encadena búsqueda + detalle
  implica 3 llamadas a Gemini (inicial, tras la búsqueda, tras el detalle) y puede acercarse o
  superar los 30s solo por latencia del free tier, sin que haya ningún error. No es un bug — es
  el guardrail funcionando como se especifica — pero el frontend (fase e) debe comunicar que una
  respuesta puede tardar, y no asumir que un `status: "error"` por timeout siempre implica una
  falla real. Además, el free tier tiene límites **diarios** muy bajos según el modelo concreto
  al que resuelva el alias (ver sección "Modelo" arriba) — un `status: "error"` con
  "Error al comunicarse con Gemini" también puede ser cuota agotada, no solo timeout.
- El agente **no ejecuta una tool dos veces con los mismos parámetros** en el mismo turno.
- **No reintenta `buscar_entidad_rues` con una variación del mismo nombre en el mismo turno una
  vez que esa búsqueda vino truncada** (`capped: true`) — guardrail agregado en fase d tras
  observar en producción (pregunta real "Banco de Bogotá" contra la API real de Croma) que el
  modelo, pese a la instrucción del system prompt, insistía llamando la tool con variaciones del
  nombre ("BANCO DE BOGOTA S.A.", "BANCO DE BOGOTA") en vez de pedir precisar al usuario — 3
  llamadas a Croma, ~26s totales, una de ellas con timeout. El system prompt solo es guía; este
  guardrail es determinístico (`lib/agent/orchestrator.ts`, `cappedSearchNames` +
  `isVariationOfCappedName`) y no depende de que el modelo lo respete.
  **Corrección (misma fase, mismo día):** la primera versión bloqueaba con un `boolean` global —
  cualquier búsqueda posterior en el turno, no solo variaciones del mismo nombre. Esto rompió un
  caso real ("Grupo Aval en alianza con banco de bogotá, que es?"): al truncarse la búsqueda de
  "Banco de Bogotá", la búsqueda de la entidad genuinamente distinta "Grupo Aval" también quedó
  bloqueada. Se corrigió comparando por nombre normalizado (mayúsculas, sin sufijos societarios
  como S.A./SAS/LTDA, sin puntuación) y solo bloqueando coincidencias/subcadenas del mismo
  nombre — dos entidades distintas en la misma pregunta ya no se bloquean entre sí.
  **Refinamiento de UX (feedback de usuario, mismo día):** la regla 4 del system prompt original
  solo le decía al modelo "pedí precisar" cuando `capped: true`, sin aprovechar que la respuesta
  de `buscar_entidad_rues` ya trae hasta 10 resultados reales en `results`. Se corrigió la regla
  4 para que, antes de pedir precisar, el modelo liste 3-5 de esos resultados (razón social, NIT,
  ciudad, estado) como ejemplos concretos — el usuario no puede "precisar" a ciegas si no ve qué
  se encontró. No requirió cambios en las tools ni en Croma: el dato ya viajaba en el
  function_response, solo faltaba instruir al modelo a usarlo.
- Si Gemini devuelve una function_call con un nombre de tool que no existe en el registry, el
  orchestrator responde un `function_response` de error sin intentar ejecutar nada.

## `thought_signature` — requisito no documentado del SDK, descubierto en fase c

Al reenviar el `function_call` del modelo como parte del historial (para que Gemini vea su propia
llamada anterior antes de recibir el `function_response`), **hay que reenviar el `Part` crudo tal
como lo devolvió la API** (`response.candidates[0].content.parts`), no reconstruir un
`{ functionCall: { name, args } }` desde cero. Los modelos actuales (familia `gemini-flash-latest`
en adelante) adjuntan un campo `thoughtSignature` a esos parts; si se omite, la siguiente llamada
falla con `400 INVALID_ARGUMENT: Function call is missing a thought_signature`. `lib/agent/
gemini-client.ts::generateTurn` expone `modelParts` (los parts crudos) exactamente por esto —
`orchestrator.ts` debe usar siempre `turn.modelParts`, nunca reconstruir el part del `function_call`
a mano.

## Declaración de herramientas (forma, no contenido)

Cada tool se declara ante Gemini con: `name`, `description` (en español, orientada a cuándo
usarla), y `parameters` como JSON Schema (`type: object`, `properties`, `required`). El contenido
exacto de cada declaración está en `docs/TOOLS_CROMA.md`; `tool-registry.ts` es la única fuente de
verdad en código.

## Qué NO hace el agente

- No llama a Croma directamente desde el frontend (ver arquitectura).
- No mezcla datos de una tool con conocimiento previo del modelo sobre la misma entidad.
- No reintenta silenciosamente ante un error de Croma sin reportarlo en `limitations` si el
  reintento también falla.
