# TOOLS_CROMA.md — Herramientas del agente sobre la API de Croma

Fuente de la documentación pública consultada: `docs.usecroma.com` (índice completo en
`docs.usecroma.com/llms.txt`). Ambas herramientas usan el mismo registro público **RUES**
(Registro Único Empresarial y Social) de Colombia, siguiendo el patrón "buscar una entidad y
consultar su detalle" que pide la prueba técnica.

## Autenticación (aplica a ambas)

- Header: `Authorization: Bearer $CROMA_API_KEY`
- Las keys de Croma son **de organización**, no personales (`personal_api_key_not_allowed` si se
  usa una personal). Deben crearse en `platform.usecroma.com`.
- Formato: `croma_live_...` en producción, `croma_test_...` en otros entornos. No mezclar.
- Todas las llamadas de datos son `POST` con body JSON.

## Envelope de respuesta de Croma

- Éxito: `{ "data": ... }`, HTTP 2xx.
- Error: `{ "error": { "type", "code", "message", "param"?, "details"? } }`, HTTP no-2xx.
- **"Sin resultados" no es un error**: lookups de un solo registro devuelven `found: false` con
  HTTP 200; búsquedas devuelven lista vacía con HTTP 200. Un 404 real significa que el endpoint o
  el `job_id` no existe.

---

## Tool 1 — `buscar_entidad_rues`

| Campo | Valor |
|---|---|
| Endpoint Croma | `POST /co/rues-entities-by-name` |
| Cuándo la usa el agente | El usuario da un **nombre** de empresa/entidad colombiana, no un identificador exacto. Corresponde al ejemplo "Busca información sobre [entidad]" del PDF. |
| Parámetros de entrada | `name` (string, requerido, mínimo 3 caracteres); `page` (number, opcional, default 1) |
| Validación propia | Rechazar `name` vacío o de 1-2 caracteres antes de llamar a Croma (evita `invalid_param` innecesario). |
| Transformación de salida | Lista de `{ nit, razon_social, camara, estado, ciudad }` — un resumen liviano por cada resultado, paginado a 10 por página según la API. |
| Errores esperables | `invalid_param` (nombre inválido), `too_many_results` (nombre demasiado genérico → el agente debe pedir precisar o mostrar solo los primeros resultados), `rate_limited`, `upstream_error`. |

## Tool 2 — `detalle_entidad_rues`

| Campo | Valor |
|---|---|
| Endpoint Croma | `POST /co/rues-entity-by-nit` |
| Cuándo la usa el agente | El usuario da un **NIT** exacto, o el agente ya obtuvo un NIT desde Tool 1 y necesita el detalle. Corresponde a "Dame el detalle de [identificador]" y, usando el histórico de estados financieros por año que trae la respuesta, a "¿Qué cambió entre X e Y?" (comparación entre dos años fiscales). |
| Parámetros de entrada | `nit` (string, requerido, solo dígitos, sin dígito de verificación separado por guion salvo que la API lo pida explícitamente — confirmar formato exacto contra el schema OpenAPI en implementación) |
| Validación propia | Rechazar `nit` no numérico o con longitud fuera de rango típico (9-10 dígitos) antes de llamar a Croma. |
| Transformación de salida | `{ found, razon_social, estado, camara, ciudad, actividades_ciiu[], direcciones[], representantes_legales[], estados_financieros: [{ year, ingresos, utilidad_neta, activos, pasivos, patrimonio }], historial_renovacion[] }` |
| Errores esperables | `found: false` (NIT no existe → el agente lo reporta como "no encontrado", no como error), `invalid_param`, `rate_limited`, `upstream_error`. |

---

## Manejo de errores común a ambas (delegado a `lib/croma/errors.ts`)

| Código Croma | Categoría interna | Mensaje al agente (para que lo traduzca al usuario) |
|---|---|---|
| `invalid_param` | `validation_error` | "El parámetro `<param>` no es válido: `<message>`" |
| `too_many_results` | `needs_narrowing` | "La búsqueda es demasiado amplia, se necesita un término más específico" |
| `invalid_api_key` / `personal_api_key_not_allowed` | `config_error` | "Credenciales de Croma no configuradas correctamente" (nunca mostrar la key) |
| `rate_limited` | `rate_limited` | "El servicio de datos está saturado, intenta de nuevo en unos segundos" |
| `upstream_error` (5xx) | `upstream_unavailable` | "La fuente oficial (RUES) no respondió; el dato no pudo verificarse ahora" |
| `internal_error` | `croma_internal_error` | "Error inesperado del proveedor de datos" |
| Timeout de red (nuestro) | `timeout` | "La consulta tardó demasiado y fue cancelada" |

`config_error` y `croma_internal_error` deben además loguearse server-side con el `X-Request-Id`
que devuelve Croma, para poder reportar el incidente si se repite.

## Nota sobre credenciales de Croma en este reto

Croma exige una key de organización creada en `platform.usecroma.com`. Si al momento de
implementar no se puede obtener una key propia dentro del tiempo del reto, seguir el plan B que
exige el PDF: implementar la capa `lib/croma/client.ts` completa y funcional, pero con un modo
`CROMA_MOCK=true` que devuelve respuestas de ejemplo **claramente marcadas como simuladas**
(`"simulated": true` en el payload y aviso visible en el `TracePanel`), documentando el bloqueo en
el README. Nunca presentar datos simulados como reales.
