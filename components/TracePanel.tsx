// Trazabilidad: tools usadas, params (redactados) y resumen (ver docs/FRONTEND.md).
// Siempre presente cuando sources.length > 0 — requisito de trazabilidad del PDF. Filtra
// defensivamente cualquier campo que parezca un secreto antes de renderizar, aunque el backend
// nunca debería enviar uno (defensa en profundidad).
"use client";

import { useState } from "react";
import type { ToolTrace } from "@/lib/types/agent";

const SECRET_KEY_PATTERN = /key|token|secret|authorization|bearer/i;
const BEARER_VALUE_PATTERN = /^bearer\s/i;

function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    const looksSecret =
      SECRET_KEY_PATTERN.test(key) || (typeof value === "string" && BEARER_VALUE_PATTERN.test(value));
    redacted[key] = looksSecret ? "[redactado]" : value;
  }
  return redacted;
}

interface TracePanelProps {
  sources: ToolTrace[];
}

export default function TracePanel({ sources }: TracePanelProps) {
  const [open, setOpen] = useState(false);

  if (sources.length === 0) return null;

  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-zinc-600 dark:text-zinc-300"
      >
        <span>
          Trazabilidad ({sources.length} {sources.length === 1 ? "consulta" : "consultas"})
        </span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <ul className="flex flex-col gap-3 border-t border-zinc-200 p-4 dark:border-zinc-800">
          {sources.map((source, index) => (
            <li key={index} className="text-xs">
              <div className="flex items-center gap-2 font-mono">
                <span
                  className={
                    source.status === "ok"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  {source.status === "ok" ? "✓" : "✕"}
                </span>
                <span className="font-semibold">{source.tool}</span>
                {typeof source.duration_ms === "number" && (
                  <span className="text-zinc-400">· {source.duration_ms}ms</span>
                )}
              </div>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">{source.summary}</p>
              <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 text-[11px] text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                {JSON.stringify(redactParams(source.params), null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
