// Cliente Croma: fetch base con auth header, timeout, reintentos y normalización de errores
// (ver docs/BACKEND.md). Todas las respuestas (éxito o error) se normalizan al shape interno
// `CromaResult` antes de llegar a las tools. Nunca loguea CROMA_API_KEY.
//
// Modo CROMA_MOCK=true: devuelve ejemplos claramente marcados con `simulated: true` (ver
// docs/TOOLS_CROMA.md, "Nota sobre credenciales de Croma en este reto"). La entidad "ACME SAS"
// / NIT 900123456 reproduce el ejemplo de docs/TRACEABILITY.md para que el flujo de demo
// funcione de punta a punta.

import { getEnv } from "@/lib/config/env";
import { mapCromaError, type CromaErrorCategory } from "@/lib/croma/errors";
import type { CromaRawErrorDetail, RuesDetailData, RuesSearchData } from "@/lib/types/croma";

export interface CromaError {
  category: CromaErrorCategory;
  message: string;
}

export interface CromaResult<T> {
  ok: boolean;
  data?: T;
  error?: CromaError;
  httpStatus?: number;
  requestId?: string;
}

interface CromaPostOptions {
  path: string;
  body: Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function cromaPost<T>({ path, body }: CromaPostOptions): Promise<CromaResult<T>> {
  const env = getEnv();

  if (env.cromaMock) {
    return buildMockResult(path, body) as CromaResult<T>;
  }

  const url = `${env.cromaApiBaseUrl}${path}`;
  const apiKey = env.cromaApiKey as string;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        env.cromaTimeoutMs,
      );
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) {
        return { ok: false, error: { category: "timeout", message: "La consulta tardó demasiado y fue cancelada" } };
      }
      if (attempt === 0) {
        await sleep(500);
        continue;
      }
      return {
        ok: false,
        error: {
          category: "upstream_unavailable",
          message: "La fuente oficial (RUES) no respondió; el dato no pudo verificarse ahora",
        },
      };
    }

    const requestId = res.headers.get("x-request-id") ?? undefined;

    if (res.ok) {
      try {
        const json = (await res.json()) as { data: T };
        return { ok: true, data: json.data, httpStatus: res.status, requestId };
      } catch {
        return {
          ok: false,
          error: { category: "croma_internal_error", message: "Error inesperado del proveedor de datos" },
          httpStatus: res.status,
          requestId,
        };
      }
    }

    if (res.status >= 500 && attempt === 0) {
      await sleep(500);
      continue;
    }

    const errorJson = (await res.json().catch(() => null)) as { error?: CromaRawErrorDetail } | null;
    const mapped = mapCromaError(res.status, errorJson?.error ?? { message: res.statusText });

    if (mapped.category === "config_error" || mapped.category === "croma_internal_error") {
      console.error(`[croma] ${mapped.category} status=${res.status} request_id=${requestId ?? "n/a"}`);
    }

    return { ok: false, error: mapped, httpStatus: res.status, requestId };
  }

  return {
    ok: false,
    error: {
      category: "upstream_unavailable",
      message: "La fuente oficial (RUES) no respondió; el dato no pudo verificarse ahora",
    },
  };
}

// Soporte reutilizable para endpoints asíncronos de Croma (ej. Superfinanciera), no usado por
// las dos tools RUES actuales — ver docs/BACKEND.md, "Jobs asíncronos de Croma".
export interface CromaJobResult<T> {
  ok: boolean;
  data?: T;
  error?: CromaError;
}

export async function cromaPollJob<T>(
  jobId: string,
  opts: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<CromaJobResult<T>> {
  const env = getEnv();

  if (env.cromaMock) {
    return {
      ok: false,
      error: { category: "croma_internal_error", message: "Poll de jobs no soportado en modo CROMA_MOCK" },
    };
  }

  const intervalMs = opts.intervalMs ?? 2000;
  const maxAttempts = opts.maxAttempts ?? 10;
  const apiKey = env.cromaApiKey as string;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${env.cromaApiBaseUrl}/jobs/${jobId}`,
        { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } },
        env.cromaTimeoutMs,
      );
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        error: isAbort
          ? { category: "timeout", message: "La consulta tardó demasiado y fue cancelada" }
          : {
              category: "upstream_unavailable",
              message: "La fuente oficial no respondió; el dato no pudo verificarse ahora",
            },
      };
    }

    if (res.status === 202) {
      await sleep(intervalMs);
      continue;
    }

    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { data: T } | null;
      if (!json) {
        return {
          ok: false,
          error: { category: "croma_internal_error", message: "Error inesperado del proveedor de datos" },
        };
      }
      return { ok: true, data: json.data };
    }

    const errorJson = (await res.json().catch(() => null)) as { error?: CromaRawErrorDetail } | null;
    return { ok: false, error: mapCromaError(res.status, errorJson?.error ?? { message: res.statusText }) };
  }

  return { ok: false, error: { category: "timeout", message: "El job no finalizó dentro del número máximo de intentos" } };
}

// ---- Modo CROMA_MOCK=true ----

function buildMockResult(
  path: string,
  body: Record<string, unknown>,
): CromaResult<RuesSearchData> | CromaResult<RuesDetailData> | CromaResult<never> {
  if (path === "/co/rues-entities-by-name") {
    const name = typeof body.name === "string" ? body.name : "";
    return { ok: true, data: buildMockSearchData(name), httpStatus: 200 };
  }

  if (path === "/co/rues-entity-by-nit") {
    const documentNumber = typeof body.document_number === "string" ? body.document_number : "";
    return { ok: true, data: buildMockDetailData(documentNumber), httpStatus: 200 };
  }

  return {
    ok: false,
    error: { category: "croma_internal_error", message: `Modo CROMA_MOCK sin datos de ejemplo para ${path}` },
  };
}

const MOCK_ACME_SEARCH_ENTITY = {
  registry_id: "MOCK-REG-0001",
  nit: "900123456",
  verification_digit: "1",
  name: "ACME SAS",
  acronym: null,
  chamber_code: "11",
  chamber_name: "Cámara de Comercio de Bogotá",
  registration_number: "0001234567",
  registration_status: "Activo",
  legal_organization: "Sociedad por Acciones Simplificada",
  last_renewed_year: "2024",
  category: "Comerciante",
  document_type: "NIT",
  detail: null,
} as const;

const MOCK_ACME_ENTITY_DETAIL = {
  registry_id: "MOCK-REG-0001",
  nit: "900123456",
  verification_digit: "1",
  name: "ACME SAS",
  acronym: null,
  chamber_code: "11",
  chamber_name: "Cámara de Comercio de Bogotá",
  registration_number: "0001234567",
  registration_status: "Activo",
  legal_organization: "Sociedad por Acciones Simplificada",
  registration_date: "2015-04-10",
  last_renewal_date: "2024-03-15",
  last_renewed_year: "2024",
  expiration_date: null,
  cancellation_date: null,
  cancellation_reason: null,
  primary_activity: { code: "6201", description: "Actividades de desarrollo de sistemas informáticos" },
  secondary_activity: { code: "6311", description: "Procesamiento de datos, hospedaje y actividades conexas" },
  commercial_address: "Calle 100 # 15-20, Oficina 501",
  commercial_municipality: "Bogotá D.C.",
  commercial_phones: ["6015551234"],
  commercial_email: "contacto@acme-simulado.example",
  fiscal_address: "Calle 100 # 15-20, Oficina 501",
  fiscal_municipality: "Bogotá D.C.",
  fiscal_phones: ["6015551234"],
  fiscal_email: "contacto@acme-simulado.example",
  is_bic: false,
  is_social_enterprise: false,
  domain_forfeiture: false,
} as const;

function buildMockSearchData(name: string): RuesSearchData {
  const trimmed = name.trim();
  const isAcme = trimmed.toLowerCase().includes("acme");

  const entities = isAcme
    ? [MOCK_ACME_SEARCH_ENTITY]
    : [
        {
          registry_id: "MOCK-REG-0099",
          nit: "900999000",
          verification_digit: "3",
          name: trimmed ? trimmed.toUpperCase() : "ENTIDAD SIMULADA SAS",
          acronym: null,
          chamber_code: "11",
          chamber_name: "Cámara de Comercio de Bogotá",
          registration_number: "0009990000",
          registration_status: "Activo",
          legal_organization: "Sociedad por Acciones Simplificada",
          last_renewed_year: "2024",
          category: "Comerciante",
          document_type: "NIT",
          detail: null,
        },
      ];

  return {
    query: name,
    capped: false,
    entities,
    pagination: { total: entities.length, page_size: 10, total_pages: 1, page: 1 },
    simulated: true,
  };
}

function buildMockDetailData(documentNumber: string): RuesDetailData {
  if (documentNumber === "900123456") {
    return {
      found: true,
      document_number: documentNumber,
      entity: MOCK_ACME_ENTITY_DETAIL,
      financials: [
        {
          year: "2022",
          current_assets: 900000000,
          non_current_assets: 1600000000,
          total_assets: 2500000000,
          current_liabilities: 500000000,
          non_current_liabilities: 600000000,
          total_liabilities: 1100000000,
          equity: 1400000000,
          ordinary_revenue: 1200000000,
          cost_of_sales: 700000000,
          operating_expenses: 320000000,
          operating_profit: 180000000,
          period_result: 150000000,
        },
        {
          year: "2023",
          current_assets: 1000000000,
          non_current_assets: 1800000000,
          total_assets: 2800000000,
          current_liabilities: 520000000,
          non_current_liabilities: 630000000,
          total_liabilities: 1150000000,
          equity: 1650000000,
          ordinary_revenue: 1450000000,
          cost_of_sales: 810000000,
          operating_expenses: 380000000,
          operating_profit: 260000000,
          period_result: 210000000,
        },
      ],
      renewals: [
        { year: "2023", renewal_date: "2023-03-10" },
        { year: "2024", renewal_date: "2024-03-15" },
      ],
      related_parties: [
        { document_number: "10012345", name: "María Fernanda Gómez", role: "Representante Legal - Principal" },
      ],
      notices: [],
      simulated: true,
    };
  }

  return {
    found: false,
    document_number: documentNumber,
    entity: null,
    financials: [],
    renewals: [],
    related_parties: [],
    notices: [],
    simulated: true,
  };
}
