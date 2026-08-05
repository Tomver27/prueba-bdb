// Declaración de tools (JSON Schema para Gemini function calling) + dispatcher por nombre
// (ver docs/AGENT_GEMINI.md, "Declaración de herramientas"). Única fuente de verdad que el
// agente consulta — añadir una tercera tool no requiere tocar orchestrator.ts (ver
// docs/STRUCTURE.md, "Cómo añadir una tercera herramienta").

import * as ruesDetail from "@/lib/tools/rues-detail";
import * as ruesSearch from "@/lib/tools/rues-search";

export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, { type: string; description: string }>;
  required: readonly string[];
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

type ToolExecutor = (params: Record<string, unknown>) => Promise<unknown>;

interface RegisteredTool {
  declaration: ToolDeclaration;
  execute: ToolExecutor;
}

function parseSearchParams(params: Record<string, unknown>): ruesSearch.BuscarEntidadRuesParams {
  return {
    name: typeof params.name === "string" ? params.name : "",
    page: typeof params.page === "number" ? params.page : undefined,
  };
}

function parseDetailParams(params: Record<string, unknown>): ruesDetail.DetalleEntidadRuesParams {
  const rawNit = params.nit;
  return {
    nit: typeof rawNit === "string" ? rawNit : rawNit != null ? String(rawNit) : "",
  };
}

const registry: Record<string, RegisteredTool> = {
  buscar_entidad_rues: {
    declaration: ruesSearch.buscarEntidadRuesSchema,
    execute: (params) => ruesSearch.execute(parseSearchParams(params)),
  },
  detalle_entidad_rues: {
    declaration: ruesDetail.detalleEntidadRuesSchema,
    execute: (params) => ruesDetail.execute(parseDetailParams(params)),
  },
};

export function getToolDeclarations(): ToolDeclaration[] {
  return Object.values(registry).map((tool) => tool.declaration);
}

export function hasTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(registry, name);
}

export async function executeTool(name: string, params: Record<string, unknown>): Promise<unknown> {
  const tool = registry[name];
  if (!tool) {
    throw new Error(`Tool desconocida: ${name}`);
  }
  return tool.execute(params);
}
