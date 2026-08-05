# BACKEND.md — Backend (rutas API del monolito Next.js)

## Endpoint principal

`POST /api/agent`

**Request**
```json
{ "question": "¿Cuál es el detalle de la empresa con NIT 900123456?" }
```

**Response 200** — ver `docs/TRACEABILITY.md` para el schema completo de `AgentResponse`.

**Validaciones antes de invocar al agente**
- `question` requerido, string no vacío tras `trim()`.
- Longitud máxima razonable (ej. 2000 caracteres) para evitar abuso del free tier de Gemini.
- Si falla la validación → HTTP 400 con `{ answer: "", sources: [], limitations: ["..."], status: "error" }` (mismo shape que una respuesta normal, para que el frontend no necesite un manejo especial).

## Endpoint secundario

`GET /api/health` — usado por Docker/Nginx para healthchecks. Responde `{ ok: true }` y,
opcionalmente, si `CROMA_API_KEY` y `GEMINI_API_KEY` están presentes (sin revelar su valor).

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `GEMINI_API_KEY` | Sí | Key del tier gratuito de Gemini (Google AI Studio) |
| `CROMA_API_KEY` | Sí (o `CROMA_MOCK=true`) | Key de organización de Croma |
| `CROMA_API_BASE_URL` | No (default `https://api.croma.run`) | Permite apuntar a otro entorno |
| `CROMA_MOCK` | No (default `false`) | Activa respuestas simuladas si no hay key de Croma disponible |
| `CROMA_TIMEOUT_MS` | No (default `15000`) | Timeout por llamada a Croma |
| `AGENT_MAX_TOOL_CALLS` | No (default `4`) | Guardrail del orchestrator |
| `NODE_ENV` | Gestionada por Next.js | `production` / `development` — **corrección (fase b):** Next.js asigna `NODE_ENV` automáticamente (`development` en `next dev`, `production` en el resto) y lo evalúa *antes* de cargar `.env`, por lo que ponerlo en `.env` no cambia el modo de la app. `lib/config/env.ts` lo lee de forma informativa (`process.env.NODE_ENV`) pero no lo exige como requerida ni falla si falta, porque Next.js garantiza que siempre tiene un valor. |

Todas viven en `.env` en el servidor (o en el `env_file` de docker-compose). `lib/config/env.ts`
debe leerlas una sola vez al boot y **fallar rápido** (proceso no arranca) si falta una requerida
y `CROMA_MOCK` no está activo — esto cumple el requisito del PDF de manejar "credenciales
ausentes" de forma explícita, no silenciosa. **Implementación (fase b):** el fail-fast se logra
con `instrumentation.ts` (convención oficial de Next.js — ver `docs/STRUCTURE.md`), cuyo
`register()` invoca `getEnv()` una vez al iniciarse el server.

## Cliente Croma (`lib/croma/client.ts`)

- Base: `fetch` con `AbortController` para el timeout (`CROMA_TIMEOUT_MS`).
- Headers fijos: `Authorization: Bearer $CROMA_API_KEY`, `Content-Type: application/json`.
- **Sin reintentos automáticos en errores 4xx** (son errores del cliente, reintentar no ayuda).
- **Reintento único con backoff corto** (ej. 1 intento adicional tras 500ms) solo ante error de
  red o `5xx`/`upstream_error` — nunca más de un reintento para no duplicar cargos de cuota
  innecesariamente en el free/paid tier de Croma.
- Todas las respuestas (éxito o error) pasan por `lib/croma/errors.ts` para normalizar al shape
  interno `{ ok: boolean, data?, error?: { category, message } }` antes de llegar a la tool.
- El cliente nunca loguea el valor de `CROMA_API_KEY`; si se loguea la request, se redacta el
  header `Authorization`.

## Jobs asíncronos de Croma

Algunos endpoints de Croma (ej. Superfinanciera, no usado por las tools actuales pero relevante si
se añade en el futuro) son asíncronos: por defecto la request espera inline y devuelve `{ data }`,
o se puede hacer poll a `GET /jobs/{id}`. Para las dos tools actuales (RUES) esto no aplica, pero
`lib/croma/client.ts` debe dejar el soporte de poll como función reutilizable para no rehacerlo si
se añade una tercera tool asíncrona.

## Orquestación

`app/api/agent/route.ts` solo debe:
1. Parsear y validar el body.
2. Llamar a `lib/agent/orchestrator.ts::run(question)`.
3. Devolver el `AgentResponse` con el status HTTP correspondiente (200 normal; 200 también para
   `status: "no_data"` o `"partial"` — no son errores HTTP, son resultados legítimos del agente;
   solo 400/500 para errores de validación o fallos no recuperables del propio backend).

## Seguridad

- `CROMA_API_KEY` y `GEMINI_API_KEY` solo se leen en código que corre en el servidor (`app/api/*`,
  `lib/*`) — nunca en un componente marcado `"use client"`.
- CORS: el endpoint `/api/agent` no necesita headers CORS abiertos; solo lo consume el mismo
  frontend servido por Nginx.
- Rate limiting básico (opcional dado el alcance de 1 día, pero recomendado si sobra tiempo): un
  límite simple por IP en memoria o en Nginx (`limit_req`) para evitar que una sola sesión agote
  la cuota gratuita de Gemini/Croma.
