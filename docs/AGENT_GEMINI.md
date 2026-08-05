# AGENT_GEMINI.md — Diseño del agente

## Modelo

- Proveedor: **Gemini API**, nivel gratuito (Google AI Studio).
- El nombre exacto del modelo (p. ej. familia `gemini-2.x-flash`) debe verificarse en la consola
  de Google AI Studio al momento de implementar — la disponibilidad del tier gratuito cambia con
  el tiempo. Requisito no negociable: el modelo elegido debe soportar **function calling /
  tool use** nativo (declaración de funciones con JSON Schema).
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
- Instrucción de reportar `found: false` o listas vacías como "no se encontró información", no
  como error.
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
- El agente **no ejecuta una tool dos veces con los mismos parámetros** en el mismo turno.
- Si Gemini devuelve una function_call con un nombre de tool que no existe en el registry, el
  orchestrator responde un `function_response` de error sin intentar ejecutar nada.

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
