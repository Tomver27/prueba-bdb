# Mini agente Usecroma — Intern Developer / AI

Aplicación web que responde preguntas en lenguaje natural sobre datos públicos de Colombia,
consultando fuentes oficiales a través de la API de [Usecroma (Croma)](https://usecroma.com/es),
mediante un agente embebido en el backend que decide qué herramienta usar, consulta los datos y
redacta una respuesta trazable, sin inventar información.

La especificación completa del diseño (para desarrollo o para guiar generación de código con IA) vive en
[`docs/`](./docs).

La página web es accesible desde internet con el siguiente enlace: http://54.147.45.192/

## Arquitectura

Monolito Next.js (App Router) desplegado en una instancia EC2 de AWS mediante Docker Compose:
Nginx como proxy inverso/TLS al frente, y el propio Next.js sirviendo tanto el frontend como las
rutas API que orquestan al agente. El agente usa **Gemini API (tier gratuito)** con function
calling para decidir qué herramienta de Croma invocar; las credenciales de Gemini y de Croma
viven únicamente en el servidor.

```
Navegador → Nginx (TLS) → Next.js (UI + API + agente) → Gemini API (razonamiento)
                                                        → Croma API (datos oficiales)
```

Detalle completo del diseño por componente:

| Documento | Contenido |
|---|---|
| [`docs/STRUCTURE.md`](./docs/STRUCTURE.md) | Estructura de carpetas y convenciones de código |
| [`docs/AGENT_GEMINI.md`](./docs/AGENT_GEMINI.md) | Diseño del agente, loop de function calling, guardrails |
| [`docs/TOOLS_CROMA.md`](./docs/TOOLS_CROMA.md) | Spec de las dos herramientas y endpoints de Croma usados |
| [`docs/BACKEND.md`](./docs/BACKEND.md) | Contrato del endpoint API, variables de entorno, manejo de errores |
| [`docs/FRONTEND.md`](./docs/FRONTEND.md) | Componentes, estados de la UI y flujo sin recarga de página |
| [`docs/TRACEABILITY.md`](./docs/TRACEABILITY.md) | Contrato de respuesta (`answer`/`sources`/`limitations`/`status`) |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Despliegue en AWS EC2 con Docker Compose |

## Endpoints de Usecroma utilizados

- `POST /co/rues/entities-by-name/v1` — búsqueda de entidades colombianas por nombre (RUES).
- `POST /co/rues/entity-by-nit/v1` — detalle completo de una entidad por NIT, incluye estados
  financieros por año (permite comparaciones simples entre periodos).

Ambos endpoints están documentados en detalle, con su mapeo de parámetros, salida y errores, en
[`docs/TOOLS_CROMA.md`](./docs/TOOLS_CROMA.md).

## Requisitos previos

- Node.js 20+ (para desarrollo local sin Docker) o Docker + Docker Compose.
- Una API key de Gemini (tier gratuito) desde [Google AI Studio](https://aistudio.google.com/).
- Una API key de organización de Croma desde [platform.usecroma.com](https://platform.usecroma.com)
  (ver nota de limitación abajo si no fue posible obtenerla dentro del tiempo del reto).

## Instalación y configuración

```bash
git clone <url-del-repo>
cd <repo>
cp .env.example .env
# completar GEMINI_API_KEY y CROMA_API_KEY en .env
```

## Variables de entorno

Ver [`.env.example`](./.env.example) y el detalle de cada variable en
[`docs/BACKEND.md`](./docs/BACKEND.md#variables-de-entorno).

## Decisiones técnicas

- **Gemini sobre Claude/otros LLMs de pago**: recomendación explícita del PDF de la prueba; evita
  fricción de billing para un reto de 1 día. El agente está diseñado con un `tool-registry`
  desacoplado del proveedor de LLM, por lo que cambiar de modelo no requiere tocar las tools.
- **RUES como fuente de datos**: de todo el catálogo público de Croma (registros judiciales,
  tributarios, de tránsito, boletines de fiscalías, legislación, etc.), se eligió RUES porque
  calza exactamente con el patrón "buscar entidad → consultar detalle/historial" sugerido en el
  PDF y con los tres ejemplos de pregunta dados.
- **Monolito Next.js en vez de frontend/backend separados**: reduce superficie de despliegue para
  el alcance de 1 día sin sacrificar la separación de responsabilidades (rutas API vs. UI vs.
  lógica del agente se mantienen en carpetas distintas, ver `docs/STRUCTURE.md`).
- **Docker Compose en EC2 en vez de un servicio gestionado (App Runner/Amplify)**: preferencia
  explícita por más control sobre la infraestructura, aceptando la carga operativa extra que eso
  implica (gestión de TLS, healthchecks, etc., documentada en `docs/DEPLOYMENT.md`).

## Limitaciones conocidas

- [Completar durante la implementación: p. ej. si no se logró obtener una API key de Croma dentro
  del tiempo del reto, documentar aquí el bloqueo exacto y confirmar que la app corre en modo
  `CROMA_MOCK=true` con respuestas claramente marcadas como simuladas — nunca presentadas como
  datos reales.]
- El agente cubre únicamente el registro RUES de Colombia; preguntas sobre Perú, México, u otras
  fuentes de Croma (SUNAT, RUNT, SECOP, etc.) quedan fuera del alcance de esta entrega y el
  agente debe responderlo explicando la limitación en vez de inventar una respuesta.
- Sin autenticación de usuarios ni persistencia de historial entre sesiones (fuera del alcance
  pedido por el PDF).

## Video de demostración

[Enlace al video de máximo 2 minutos — pendiente de grabar tras el despliegue final.]