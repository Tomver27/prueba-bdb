// Estado de carga mientras el agente selecciona y consulta herramientas (ver docs/FRONTEND.md).
// Indicador de "escribiendo" (3 puntos con rebote escalonado, estilo chat) en vez de un spinner
// genérico — el mensaje además comunica que puede tardar, ver la nota operativa de latencia en
// docs/AGENT_GEMINI.md ("Guardrails").

export default function LoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
    >
      <div className="flex shrink-0 items-center gap-1">
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s] dark:bg-zinc-400" />
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s] dark:bg-zinc-400" />
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-zinc-500 dark:bg-zinc-400" />
      </div>
      <span>
        Consultando fuentes oficiales (RUES)… puede tardar hasta 30 segundos mientras el agente
        busca y verifica los datos.
      </span>
    </div>
  );
}
