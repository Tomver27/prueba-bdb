// Animación de carga al iniciar la página (una sola vez por carga completa del navegador),
// inspirada en el Preloader de macarena-en-movimiento (título + barra de progreso + contador +
// slide-up), pero implementada con CSS/React puro en vez de GSAP para no sumar una dependencia
// nueva a este proyecto (ver docs/FRONTEND.md).
"use client";

import { useEffect, useState } from "react";

interface PageLoaderProps {
  onComplete: () => void;
}

const FILL_DURATION_MS = 1400;
const EXIT_DURATION_MS = 700;

export default function PageLoader({ onComplete }: PageLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(100, Math.round((elapsed / FILL_DURATION_MS) * 100));
      setProgress(pct);

      if (pct >= 100) {
        setLeaving(true);
        window.setTimeout(onComplete, EXIT_DURATION_MS);
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[999] flex flex-col items-center justify-center gap-6 bg-black transition-transform ease-[cubic-bezier(0.83,0,0.17,1)] ${
        leaving ? "-translate-y-full" : "translate-y-0"
      }`}
      style={{ transitionDuration: `${EXIT_DURATION_MS}ms` }}
    >
      <h1 className="text-3xl font-semibold tracking-wide text-zinc-50 sm:text-4xl">Agente RUES</h1>
      <div className="h-px w-64 overflow-hidden bg-zinc-800 sm:w-80">
        <div className="h-full bg-zinc-100 transition-[width] duration-100 ease-linear" style={{ width: `${progress}%` }} />
      </div>
      <span className="text-xs tracking-[0.3em] text-zinc-500 tabular-nums">{String(progress).padStart(3, "0")}</span>
    </div>
  );
}
