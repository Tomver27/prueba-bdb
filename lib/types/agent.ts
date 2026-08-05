// Contrato de respuesta y trazabilidad del agente (ver docs/TRACEABILITY.md).

export type AgentStatus = "ok" | "partial" | "no_data" | "error";

export interface ToolTrace {
  tool: string;
  params: Record<string, unknown>;
  status: "ok" | "error";
  http_status?: number;
  summary: string;
  duration_ms?: number;
}

export interface AgentResponse {
  answer: string;
  sources: ToolTrace[];
  limitations: string[];
  status: AgentStatus;
}
