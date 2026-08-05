// Mapeo de errores de Croma a categorías internas (ver docs/TOOLS_CROMA.md).
//
// Cubre tanto las categorías nombradas en docs/TOOLS_CROMA.md (invalid_param, too_many_results,
// invalid_api_key, personal_api_key_not_allowed, rate_limited, upstream_error, internal_error)
// como la taxonomía `type` real observada en docs.usecroma.com al implementar (fase b):
// invalid_request_error, authentication_error, rate_limit_error, api_error, upstream_error.
// Se usa `code` cuando está presente y si no, `type` + status HTTP como respaldo, para no
// depender de que una única fuente esté completa o actualizada.

import type { CromaRawErrorDetail } from "@/lib/types/croma";

export type CromaErrorCategory =
  | "validation_error"
  | "needs_narrowing"
  | "config_error"
  | "rate_limited"
  | "upstream_unavailable"
  | "croma_internal_error"
  | "timeout";

export interface CategorizedCromaError {
  category: CromaErrorCategory;
  message: string;
}

export function mapCromaError(httpStatus: number, error: CromaRawErrorDetail): CategorizedCromaError {
  const type = error.type ?? "";
  const code = error.code ?? "";

  if (code === "too_many_results") {
    return {
      category: "needs_narrowing",
      message: "La búsqueda es demasiado amplia, se necesita un término más específico",
    };
  }

  if (type === "invalid_request_error" || code === "invalid_param" || httpStatus === 400) {
    const param = error.param ? ` \`${error.param}\`` : "";
    return {
      category: "validation_error",
      message: `El parámetro${param} no es válido: ${error.message ?? "solicitud inválida"}`,
    };
  }

  if (
    type === "authentication_error" ||
    code === "invalid_api_key" ||
    code === "personal_api_key_not_allowed" ||
    httpStatus === 401
  ) {
    return { category: "config_error", message: "Credenciales de Croma no configuradas correctamente" };
  }

  if (type === "rate_limit_error" || httpStatus === 429) {
    return {
      category: "rate_limited",
      message: "El servicio de datos está saturado, intenta de nuevo en unos segundos",
    };
  }

  if (type === "upstream_error" || httpStatus === 502) {
    return {
      category: "upstream_unavailable",
      message: "La fuente oficial (RUES) no respondió; el dato no pudo verificarse ahora",
    };
  }

  return { category: "croma_internal_error", message: "Error inesperado del proveedor de datos" };
}
