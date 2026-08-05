// Tool `buscar_entidad_rues` — POST /co/rues/entities-by-name/v1 (ver docs/TOOLS_CROMA.md).
// El usuario da un nombre de empresa, no un identificador exacto.

import { cromaPost } from "@/lib/croma/client";
import type { CromaErrorCategory } from "@/lib/croma/errors";
import type { RuesSearchData } from "@/lib/types/croma";

export interface BuscarEntidadRuesParams {
  name: string;
  page?: number;
}

export interface RuesSearchSummaryItem {
  nit: string | null;
  razon_social: string | null;
  camara: string | null;
  estado: string | null;
  ciudad: string | null;
}

export interface BuscarEntidadRuesResult {
  ok: boolean;
  simulated: boolean;
  // true cuando Croma truncó los resultados por búsqueda demasiado genérica (HTTP 200,
  // no es un error) — el agente debe pedir al usuario que precise la búsqueda.
  capped: boolean;
  results: RuesSearchSummaryItem[];
  page: number;
  total_pages?: number;
  error?: { category: CromaErrorCategory; message: string };
}

export const buscarEntidadRuesSchema = {
  name: "buscar_entidad_rues",
  description:
    "Busca entidades colombianas registradas en RUES por nombre o razón social. Úsala cuando " +
    "el usuario da un nombre de empresa en vez de un NIT exacto.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre o razón social a buscar (mínimo 3 caracteres)." },
      page: { type: "number", description: "Número de página de resultados (default 1)." },
    },
    required: ["name"],
  },
} as const;

export async function execute(params: BuscarEntidadRuesParams): Promise<BuscarEntidadRuesResult> {
  const name = (params.name ?? "").trim();
  const page = params.page && params.page > 0 ? params.page : 1;

  if (name.length < 3) {
    return {
      ok: false,
      simulated: false,
      capped: false,
      results: [],
      page,
      error: {
        category: "validation_error",
        message: "El parámetro `name` no es válido: debe tener al menos 3 caracteres",
      },
    };
  }

  const res = await cromaPost<RuesSearchData>({
    path: "/co/rues/entities-by-name/v1",
    body: { name, page },
  });

  if (!res.ok || !res.data) {
    return {
      ok: false,
      simulated: false,
      capped: false,
      results: [],
      page,
      error: res.error ?? { category: "croma_internal_error", message: "Error inesperado del proveedor de datos" },
    };
  }

  const results: RuesSearchSummaryItem[] = res.data.entities.map((entity) => ({
    nit: entity.nit,
    razon_social: entity.name,
    camara: entity.chamber_name,
    estado: entity.registration_status,
    ciudad: entity.detail?.commercial_municipality ?? entity.detail?.fiscal_municipality ?? null,
  }));

  return {
    ok: true,
    simulated: res.data.simulated ?? false,
    capped: res.data.capped,
    results,
    page: res.data.pagination.page,
    total_pages: res.data.pagination.total_pages,
  };
}
