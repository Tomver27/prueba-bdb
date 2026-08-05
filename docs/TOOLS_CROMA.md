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
| Transformación de salida | Lista de `{ nit, razon_social, camara, estado, ciudad }` — un resumen liviano por cada resultado, paginado a 10 por página según la API. Mapeo real (`lib/tools/rues-search.ts`): `razon_social`←`name`, `camara`←`chamber_name`, `estado`←`registration_status`, `ciudad`←`detail.commercial_municipality` (el campo `detail` de cada resultado de búsqueda suele venir `null`, por lo que `ciudad` frecuentemente queda `null` en resultados de búsqueda; para tener `ciudad` con certeza hay que pedir `detalle_entidad_rues`). |
| Errores esperables | `invalid_param` (nombre inválido), `rate_limited`, `upstream_error`. **Corrección (confirmada en fase b):** una búsqueda demasiado genérica **no** es un error — Croma responde HTTP 200 con `capped: true` en el envelope de éxito. El agente debe leer ese flag (expuesto como `capped` en el resultado de la tool) y pedir al usuario que precise la búsqueda, no tratarlo como `too_many_results`. |

## Tool 2 — `detalle_entidad_rues`

| Campo | Valor |
|---|---|
| Endpoint Croma | `POST /co/rues-entity-by-nit` |
| Cuándo la usa el agente | El usuario da un **NIT** exacto, o el agente ya obtuvo un NIT desde Tool 1 y necesita el detalle. Corresponde a "Dame el detalle de [identificador]" y, usando el histórico de estados financieros por año que trae la respuesta, a "¿Qué cambió entre X e Y?" (comparación entre dos años fiscales). |
| Parámetros de entrada | `nit` (string, requerido, solo dígitos, sin dígito de verificación, 9-10 dígitos). **Nota (confirmado contra `docs.usecroma.com` en fase b):** el campo que Croma espera en el body real es `document_number` (patrón `^\d{4,15}$`), no `nit`. Nuestra tool sigue exponiendo el parámetro como `nit` de cara a Gemini/el agente (más natural para el modelo) y `lib/tools/rues-detail.ts` lo mapea a `document_number` al construir el request. |
| Validación propia | Rechazar `nit` no numérico o con longitud fuera de rango típico (9-10 dígitos) antes de llamar a Croma. |
| Transformación de salida | `{ found, razon_social, estado, camara, ciudad, actividades_ciiu[], direcciones[], representantes_legales[], estados_financieros: [{ year, ingresos, utilidad_neta, activos, pasivos, patrimonio }], historial_renovacion[] }`. Mapeo real (`lib/tools/rues-detail.ts`): `estado`←`registration_status`, `camara`←`chamber_name`, `ciudad`←`commercial_municipality` con fallback a `fiscal_municipality`, `actividades_ciiu`←`[primary_activity, secondary_activity]`, `representantes_legales`←`related_parties` (`name`/`document_number`/`role`), `historial_renovacion`←`renewals`. En `estados_financieros`: `ingresos`←`ordinary_revenue`, `activos`←`total_assets`, `pasivos`←`total_liabilities`, `patrimonio`←`equity`, y **`utilidad_neta`←`period_result`** (el schema real de Croma no expone un campo literal "utilidad neta"; `period_result`, resultado del período, es el análogo más cercano — `operating_profit`, ganancia operacional, sería otra lectura válida pero no equivale a utilidad neta). |
| Errores esperables | `found: false` (NIT no existe → el agente lo reporta como "no encontrado", no como error), `invalid_param`, `rate_limited`, `upstream_error`. |

---

## Manejo de errores común a ambas (delegado a `lib/croma/errors.ts`)

**Corrección (confirmada contra `docs.usecroma.com` en fase b):** la taxonomía real de errores de
Croma usa un campo `type` (`invalid_request_error`, `authentication_error`, `rate_limit_error`,
`api_error`, `upstream_error`) más un `code` opcional más específico, no los nombres de código
enumerados abajo tal cual. `lib/croma/errors.ts::mapCromaError` mapea por `code` cuando está
presente y si no por `type` + status HTTP, para cubrir ambas fuentes sin depender de que una sola
esté completa o actualizada. La tabla siguiente son las categorías internas resultantes:

| `type` / `code` de Croma | Status HTTP típico | Categoría interna | Mensaje al agente (para que lo traduzca al usuario) |
|---|---|---|---|
| `code: invalid_param` / `type: invalid_request_error` | 400 | `validation_error` | "El parámetro `<param>` no es válido: `<message>`" |
| `code: too_many_results` | 200 (no es error, ver Tool 1) | `needs_narrowing` | "La búsqueda es demasiado amplia, se necesita un término más específico" |
| `type: authentication_error` / `invalid_api_key` / `personal_api_key_not_allowed` | 401 | `config_error` | "Credenciales de Croma no configuradas correctamente" (nunca mostrar la key) |
| `type: rate_limit_error` | 429 | `rate_limited` | "El servicio de datos está saturado, intenta de nuevo en unos segundos" |
| `type: upstream_error` | 502 | `upstream_unavailable` | "La fuente oficial (RUES) no respondió; el dato no pudo verificarse ahora" |
| `type: api_error` (u otro no reconocido) | 500 | `croma_internal_error` | "Error inesperado del proveedor de datos" |
| Timeout de red (nuestro, no viene de Croma) | — | `timeout` | "La consulta tardó demasiado y fue cancelada" |

`config_error` y `croma_internal_error` deben además loguearse server-side con el `X-Request-Id`
que devuelve Croma, para poder reportar el incidente si se repite.

## Nota sobre credenciales de Croma en este reto

Croma exige una key de organización creada en `platform.usecroma.com`. Si al momento de
implementar no se puede obtener una key propia dentro del tiempo del reto, seguir el plan B que
exige el PDF: implementar la capa `lib/croma/client.ts` completa y funcional, pero con un modo
`CROMA_MOCK=true` que devuelve respuestas de ejemplo **claramente marcadas como simuladas**
(`"simulated": true` en el payload y aviso visible en el `TracePanel`), documentando el bloqueo en
el README. Nunca presentar datos simulados como reales.
