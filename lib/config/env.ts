// Lectura y validación fail-fast de variables de entorno (ver docs/BACKEND.md).
//
// `getEnv()` valida en el primer acceso y cachea el resultado; `instrumentation.ts` la invoca
// en `register()` para que el arranque del servidor falle si faltan credenciales requeridas y
// CROMA_MOCK no está activo (ver node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
//
// Nota: NODE_ENV no se valida aquí — Next.js lo asigna automáticamente (`development` en
// `next dev`, `production` en el resto) y no puede sobreescribirse de forma fiable vía `.env`
// (ver node_modules/next/dist/docs/01-app/02-guides/environment-variables.md, "Good to know").

export interface Env {
  geminiApiKey: string;
  cromaApiKey: string | null;
  cromaApiBaseUrl: string;
  cromaMock: boolean;
  cromaTimeoutMs: number;
  agentMaxToolCalls: number;
  nodeEnv: string;
}

let cachedEnv: Env | null = null;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadEnv(): Env {
  const cromaMock = process.env.CROMA_MOCK === "true";

  const missing: string[] = [];
  if (!process.env.GEMINI_API_KEY) missing.push("GEMINI_API_KEY");
  if (!cromaMock && !process.env.CROMA_API_KEY) missing.push("CROMA_API_KEY (o activar CROMA_MOCK=true)");

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno requeridas: ${missing.join(", ")}. Ver docs/BACKEND.md#variables-de-entorno.`,
    );
  }

  return {
    geminiApiKey: process.env.GEMINI_API_KEY as string,
    cromaApiKey: process.env.CROMA_API_KEY ?? null,
    cromaApiBaseUrl: process.env.CROMA_API_BASE_URL || "https://api.croma.run",
    cromaMock,
    cromaTimeoutMs: parsePositiveInt(process.env.CROMA_TIMEOUT_MS, 15000),
    agentMaxToolCalls: parsePositiveInt(process.env.AGENT_MAX_TOOL_CALLS, 4),
    nodeEnv: process.env.NODE_ENV ?? "development",
  };
}

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
  }
  return cachedEnv;
}
