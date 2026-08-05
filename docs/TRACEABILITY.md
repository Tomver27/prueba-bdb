# TRACEABILITY.md — Contrato de respuesta y trazabilidad

## Tipo `AgentResponse` (contrato entre backend y frontend)

```ts
type AgentStatus = "ok" | "partial" | "no_data" | "error";

interface ToolTrace {
  tool: string;                 // ej. "detalle_entidad_rues"
  params: Record<string, unknown>; // params usados, ya sin secretos
  status: "ok" | "error";
  http_status?: number;         // status HTTP devuelto por Croma, si aplica
  summary: string;              // 1-2 líneas: qué devolvió el dato, en lenguaje natural
  duration_ms?: number;
}

interface AgentResponse {
  answer: string;                // en español, distingue hechos de inferencias
  sources: ToolTrace[];          // vacío si no se usó ninguna herramienta
  limitations: string[];         // vacío si no hubo limitaciones
  status: AgentStatus;
}
```

## Semántica de `status`

| Status | Cuándo se usa |
|---|---|
| `ok` | Al menos una herramienta se ejecutó con éxito y produjo datos suficientes para responder la pregunta completa. |
| `partial` | Se obtuvo información relevante pero incompleta (ej. se encontró la entidad pero no el dato específico pedido, o solo una de dos fuentes necesarias respondió). |
| `no_data` | Las herramientas se ejecutaron correctamente pero no encontraron el registro (`found: false` / lista vacía). No es un fallo del sistema. |
| `error` | Fallo técnico: timeout, error de Croma no recuperable, error de Gemini, o el agente no pudo concluir dentro de `AGENT_MAX_TOOL_CALLS`. |

## Ejemplos

**Éxito**
```json
{
  "answer": "La empresa ACME SAS (NIT 900123456) está activa, registrada en la Cámara de Comercio de Bogotá. Sus ingresos operacionales pasaron de $1.200M en 2022 a $1.450M en 2023, un aumento del 20.8%.",
  "sources": [
    { "tool": "buscar_entidad_rues", "params": {"name": "ACME"}, "status": "ok", "summary": "1 coincidencia encontrada: ACME SAS, NIT 900123456" },
    { "tool": "detalle_entidad_rues", "params": {"nit": "900123456"}, "status": "ok", "summary": "Estado activo; estados financieros disponibles para 2022 y 2023" }
  ],
  "limitations": [],
  "status": "ok"
}
```

**Sin datos**
```json
{
  "answer": "No se encontró ninguna entidad registrada en RUES con el NIT 900999999.",
  "sources": [
    { "tool": "detalle_entidad_rues", "params": {"nit": "900999999"}, "status": "ok", "summary": "found: false" }
  ],
  "limitations": [],
  "status": "no_data"
}
```

**Error**
```json
{
  "answer": "No fue posible completar la consulta porque la fuente oficial (RUES) no respondió a tiempo.",
  "sources": [
    { "tool": "detalle_entidad_rues", "params": {"nit": "900123456"}, "status": "error", "summary": "timeout tras 15000ms" }
  ],
  "limitations": ["La verificación en RUES no pudo completarse; intenta de nuevo en unos minutos."],
  "status": "error"
}
```

## Reglas de redacción de `answer`

- Nunca incluir un dato que no aparezca en `sources[].summary` o en el `data` crudo de esa tool.
- Cuando el texto incluya una inferencia (ej. "esto sugiere...", "en comparación con..."), debe
  quedar señalada como tal — no presentarla con el mismo peso que un hecho directo del dato.
- Si `sources` está vacío, `answer` debe explicar por qué (ninguna herramienta disponible cubre
  la pregunta) en vez de responder con conocimiento general del modelo.
