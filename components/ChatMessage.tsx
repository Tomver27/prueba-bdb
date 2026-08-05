// Un turno de la conversación: pregunta del usuario (burbuja a la derecha) + respuesta del
// agente (izquierda) — ver docs/FRONTEND.md.
//
// Esto es solo la vista de historial dentro de la sesión del navegador (se pierde al recargar).
// NO implica memoria conversacional real: cada pregunta sigue siendo una llamada independiente y
// sin contexto a POST /api/agent — el orchestrator arranca `contents` desde cero por pregunta
// (ver docs/AGENT_GEMINI.md). El tipo `Exchange` es puramente de estado de UI, por eso vive acá
// y no en lib/types/agent.ts (que es el espejo del contrato real con el backend).

import AnswerCard from "@/components/AnswerCard";
import ErrorState from "@/components/ErrorState";
import LoadingState from "@/components/LoadingState";
import TracePanel from "@/components/TracePanel";
import type { AgentResponse } from "@/lib/types/agent";

export interface Exchange {
  id: number;
  question: string;
  status: "loading" | "done" | "network-error";
  response?: AgentResponse;
  errorMessage?: string;
}

interface ChatMessageProps {
  exchange: Exchange;
  onRetry: (question: string) => void;
}

export default function ChatMessage({ exchange, onRetry }: ChatMessageProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
          {exchange.question}
        </div>
      </div>

      <div className="flex justify-start">
        <div className="flex w-full max-w-[85%] flex-col gap-2">
          {exchange.status === "loading" && <LoadingState />}

          {exchange.status === "network-error" && (
            <ErrorState
              message={exchange.errorMessage ?? "Ocurrió un error inesperado."}
              onRetry={() => onRetry(exchange.question)}
            />
          )}

          {exchange.status === "done" && exchange.response && exchange.response.status === "error" && (
            <ErrorState
              message={
                exchange.response.answer.trim() ||
                exchange.response.limitations[0] ||
                "Ocurrió un error inesperado. Intenta de nuevo."
              }
              onRetry={() => onRetry(exchange.question)}
            />
          )}

          {exchange.status === "done" && exchange.response && exchange.response.status !== "error" && (
            <>
              <AnswerCard response={exchange.response} />
              <TracePanel sources={exchange.response.sources} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
