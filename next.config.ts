import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera .next/standalone (server.js mínimo + solo los archivos que realmente se usan,
  // sin necesitar node_modules completo) — hace que docker/Dockerfile (fase f) sea más liviano
  // que copiar .next + node_modules de producción enteros (ver docs/DEPLOYMENT.md).
  output: "standalone",
};

export default nextConfig;
