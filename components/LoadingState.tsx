// Estado de carga mientras el agente selecciona y consulta herramientas (ver docs/FRONTEND.md).
// El mensaje comunica que puede tardar — ver la nota operativa de latencia en
// docs/AGENT_GEMINI.md ("Guardrails").

export default function LoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
    >
      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-300" />
      <span>
        Consultando fuentes oficiales (RUES)… puede tardar hasta 30 segundos mientras el agente
        busca y verifica los datos.
      </span>
    </div>
  );
}
