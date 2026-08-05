// Respuesta del agente: answer + limitations en secciones separadas (ver docs/FRONTEND.md).
// No se renderiza cuando status es "error" — eso lo cubre ErrorState (ver app/page.tsx).

import type { AgentResponse } from "@/lib/types/agent";

interface AnswerCardProps {
  response: AgentResponse;
}

const STATUS_LABEL: Partial<Record<AgentResponse["status"], string>> = {
  no_data: "Sin resultados en RUES",
  partial: "Respuesta parcial",
};

export default function AnswerCard({ response }: AnswerCardProps) {
  const badge = STATUS_LABEL[response.status];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {badge && (
        <span className="w-fit rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {badge}
        </span>
      )}

      <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-200">{response.answer}</p>

      {response.limitations.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="mb-1 font-medium">Limitaciones</p>
          <ul className="list-disc space-y-1 pl-5">
            {response.limitations.map((limitation, index) => (
              <li key={index}>{limitation}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
