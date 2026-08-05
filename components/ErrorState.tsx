// Pregunta vacía, timeout, error de Croma/Gemini, credenciales ausentes (ver docs/FRONTEND.md).
// `message` ya viene en español y sin detalle técnico (lo arma app/api/agent/route.ts /
// lib/agent/orchestrator.ts) — el detalle técnico solo vive en los logs del servidor.

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      <p>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="w-fit rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900"
      >
        Reintentar
      </button>
    </div>
  );
}
