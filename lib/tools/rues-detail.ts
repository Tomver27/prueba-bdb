// Tool `detalle_entidad_rues` — POST /co/rues/entity-by-nit/v1 (ver docs/TOOLS_CROMA.md).
// El usuario da un NIT exacto, o el agente ya obtuvo uno con buscar_entidad_rues.
//
// Nota: el campo real que espera Croma es `document_number`, no `nit` (verificado contra
// docs.usecroma.com en fase b) — se mapea aquí para no romper el nombre de parámetro que
// docs/TOOLS_CROMA.md y docs/AGENT_GEMINI.md exponen al modelo.

import { cromaPost } from "@/lib/croma/client";
import type { CromaErrorCategory } from "@/lib/croma/errors";
import type { RuesDetailData } from "@/lib/types/croma";

export interface DetalleEntidadRuesParams {
  nit: string;
}

export interface CiiuActivityResumen {
  code: string | null;
  description: string | null;
}

export interface RepresentanteLegalResumen {
  nombre: string | null;
  documento: string | null;
  cargo: string | null;
}

export interface EstadoFinancieroResumen {
  year: string | null;
  ingresos: number | null;
  utilidad_neta: number | null;
  activos: number | null;
  pasivos: number | null;
  patrimonio: number | null;
}

export interface HistorialRenovacionResumen {
  year: string | null;
  fecha: string | null;
}

export interface DetalleEntidadRuesResult {
  ok: boolean;
  simulated: boolean;
  found: boolean;
  razon_social?: string | null;
  estado?: string | null;
  camara?: string | null;
  ciudad?: string | null;
  actividades_ciiu?: CiiuActivityResumen[];
  direcciones?: string[];
  representantes_legales?: RepresentanteLegalResumen[];
  estados_financieros?: EstadoFinancieroResumen[];
  historial_renovacion?: HistorialRenovacionResumen[];
  error?: { category: CromaErrorCategory; message: string };
}

// NIT colombiano sin dígito de verificación: 9-10 dígitos (ver docs/TOOLS_CROMA.md).
const NIT_PATTERN = /^\d{9,10}$/;

export const detalleEntidadRuesSchema = {
  name: "detalle_entidad_rues",
  description:
    "Obtiene el detalle completo de una entidad colombiana registrada en RUES a partir de su " +
    "NIT exacto, incluyendo estados financieros por año. Úsala cuando el usuario da un NIT, o " +
    "tras obtener uno con buscar_entidad_rues.",
  parameters: {
    type: "object",
    properties: {
      nit: {
        type: "string",
        description: "NIT de la entidad, solo dígitos, sin dígito de verificación (9-10 dígitos).",
      },
    },
    required: ["nit"],
  },
} as const;

export async function execute(params: DetalleEntidadRuesParams): Promise<DetalleEntidadRuesResult> {
  const nit = (params.nit ?? "").trim();

  if (!NIT_PATTERN.test(nit)) {
    return {
      ok: false,
      simulated: false,
      found: false,
      error: {
        category: "validation_error",
        message: "El parámetro `nit` no es válido: debe contener solo dígitos (9-10)",
      },
    };
  }

  const res = await cromaPost<RuesDetailData>({
    path: "/co/rues/entity-by-nit/v1",
    body: { document_number: nit },
  });

  if (!res.ok || !res.data) {
    return {
      ok: false,
      simulated: false,
      found: false,
      error: res.error ?? { category: "croma_internal_error", message: "Error inesperado del proveedor de datos" },
    };
  }

  const { data } = res;

  if (!data.found || !data.entity) {
    return { ok: true, simulated: data.simulated ?? false, found: false };
  }

  const entity = data.entity;

  return {
    ok: true,
    simulated: data.simulated ?? false,
    found: true,
    razon_social: entity.name,
    estado: entity.registration_status,
    camara: entity.chamber_name,
    ciudad: entity.commercial_municipality ?? entity.fiscal_municipality ?? null,
    actividades_ciiu: [entity.primary_activity, entity.secondary_activity].filter(
      (a): a is CiiuActivityResumen => Boolean(a && (a.code || a.description)),
    ),
    direcciones: [entity.commercial_address, entity.fiscal_address].filter((d): d is string => Boolean(d)),
    representantes_legales: (data.related_parties ?? []).map((p) => ({
      nombre: p.name,
      documento: p.document_number,
      cargo: p.role,
    })),
    // `utilidad_neta` se mapea desde `period_result` (resultado del período): es el análogo más
    // cercano a "utilidad neta" en el schema real de Croma, que no expone ese campo literal.
    estados_financieros: (data.financials ?? []).map((f) => ({
      year: f.year,
      ingresos: f.ordinary_revenue,
      utilidad_neta: f.period_result,
      activos: f.total_assets,
      pasivos: f.total_liabilities,
      patrimonio: f.equity,
    })),
    historial_renovacion: (data.renewals ?? []).map((r) => ({ year: r.year, fecha: r.renewal_date })),
  };
}
