# STRUCTURE.md — Estructura del proyecto

> Spec de referencia para guiar la generación de código (humano o IA). Define dónde vive cada
> responsabilidad. No añadir carpetas nuevas en la raíz sin actualizar este documento.

## Árbol de carpetas

```
.
├── app/
│   ├── layout.tsx                 # Layout raíz (fuente, metadata, providers)
│   ├── page.tsx                   # Página única: interfaz de consulta
│   ├── globals.css
│   └── api/
│       ├── agent/
│       │   └── route.ts           # POST — único endpoint que el frontend consume
│       └── health/
│           └── route.ts           # GET — healthcheck (usado por docker-compose / nginx)
│
├── lib/
│   ├── agent/
│   │   ├── orchestrator.ts        # Loop de function calling con Gemini
│   │   ├── system-prompt.ts       # Prompt base del agente (ver AGENT_GEMINI.md)
│   │   └── gemini-client.ts       # Wrapper delgado sobre el SDK/API de Gemini
│   │
│   ├── tools/
│   │   ├── tool-registry.ts       # Declaración de tools (schema) + dispatcher por nombre
│   │   ├── rues-search.ts         # Tool 1: buscar_entidad_rues
│   │   └── rues-detail.ts         # Tool 2: detalle_entidad_rues
│   │
│   ├── croma/
│   │   ├── client.ts              # fetch base: auth header, timeout, reintentos, errores
│   │   └── errors.ts              # Mapeo de códigos de error de Croma → categorías internas
│   │
│   ├── types/
│   │   ├── agent.ts               # AgentResponse, ToolTrace, AgentStatus
│   │   └── croma.ts               # Tipos de request/response por endpoint de Croma
│   │
│   └── config/
│       └── env.ts                 # Lectura y validación de variables de entorno (fail-fast)
│
├── components/
│   ├── ChatBox.tsx                # Campo de pregunta + botón de envío
│   ├── AnswerCard.tsx             # Respuesta del agente (answer + limitations)
│   ├── TracePanel.tsx             # Trazabilidad: tools usadas, params, resumen
│   ├── LoadingState.tsx
│   └── ErrorState.tsx
│
├── docker/
│   ├── Dockerfile                 # Build multi-stage de Next.js
│   └── nginx.conf                 # Proxy inverso + TLS
│
├── docs/                          # Este directorio (specs, no código)
│   ├── STRUCTURE.md
│   ├── AGENT_GEMINI.md
│   ├── BACKEND.md
│   ├── FRONTEND.md
│   ├── TOOLS_CROMA.md
│   ├── TRACEABILITY.md
│   └── DEPLOYMENT.md
│
├── docker-compose.yml
├── .env.example
├── README.md
└── package.json
```

## Convenciones

- **TypeScript estricto** (`strict: true` en `tsconfig.json`). Nada de `any` implícito en las
  fronteras de `lib/tools/*` y `lib/croma/*`.
- **Alias de imports**: `@/lib/*`, `@/components/*` (configurar en `tsconfig.json` paths). Evitar
  rutas relativas largas (`../../../`).
- **Una responsabilidad por archivo**: cada archivo en `lib/tools/` implementa exactamente una
  herramienta (una función exportada `execute(params)` + su schema de parámetros).
- **Nada de lógica de negocio en `app/api/*/route.ts`**: las rutas solo validan la entrada HTTP,
  llaman a `lib/agent/orchestrator.ts` y devuelven la respuesta. Toda la orquestación vive en `lib/`.
- **Server-only**: cualquier archivo que importe `CROMA_API_KEY` o `GEMINI_API_KEY` debe estar en
  `lib/` o `app/api/`, nunca en `components/` (que se ejecuta también en el cliente).

## Cómo añadir una tercera herramienta (extensión futura)

1. Crear `lib/tools/<nombre>.ts` siguiendo el mismo contrato que `rues-search.ts`.
2. Registrarla en `lib/tools/tool-registry.ts` (schema + dispatcher).
3. Documentar el endpoint de Croma que usa en `docs/TOOLS_CROMA.md`.
4. No se requiere ningún cambio en `orchestrator.ts` ni en el frontend: el registry es la única
   fuente de verdad que Gemini consulta.
