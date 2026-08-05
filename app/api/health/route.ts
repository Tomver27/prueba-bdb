// GET /api/health — healthcheck usado por Docker/Nginx (ver docs/BACKEND.md).
// Para cuando esta ruta se ejecuta, `instrumentation.ts` ya validó las credenciales requeridas
// al arrancar el server (fail-fast), así que `getEnv()` aquí solo lee el valor ya cacheado.

import { NextResponse } from "next/server";
import { getEnv } from "@/lib/config/env";

export async function GET() {
  const env = getEnv();

  return NextResponse.json({
    ok: true,
    credentials: {
      gemini: Boolean(env.geminiApiKey),
      croma: env.cromaMock ? "mock" : Boolean(env.cromaApiKey),
    },
  });
}
