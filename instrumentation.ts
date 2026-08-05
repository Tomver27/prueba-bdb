// Fail-fast de variables de entorno al arrancar el servidor (ver docs/BACKEND.md,
// "lib/config/env.ts debe ... fallar rápido (proceso no arranca)").
// Convención oficial de Next.js: node_modules/next/dist/docs/01-app/02-guides/instrumentation.md
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("@/lib/config/env");
    getEnv();
  }
}
