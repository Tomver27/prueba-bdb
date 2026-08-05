// Interfaz de consulta de una sola página, sin recarga entre consultas (ver docs/FRONTEND.md).
// Estado: idle -> loading -> (result con status ok/partial/no_data -> AnswerCard+TracePanel |
// result con status error / fallo de red -> ErrorState) -> idle (al iniciar nueva consulta).
"use client";

import { useState } from "react";
import ChatBox from "@/components/ChatBox";
import AnswerCard from "@/components/AnswerCard";
import TracePanel from "@/components/TracePanel";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import type { AgentResponse } from "@/lib/types/agent";

type ViewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; response: AgentResponse }
  | { kind: "network-error"; message: string };

export default function Home() {
  const [view, setView] = useState<ViewState>({ kind: "idle" });
  const [lastQuestion, setLastQuestion] = useState("");

  async function ask(question: string) {
    setLastQuestion(question);
    setView({ kind: "loading" });

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = (await res.json()) as AgentResponse;
      setView({ kind: "result", response: body });
    } catch {
      setView({
        kind: "network-error",
        message: "No fue posible conectar con el servidor. Verifica tu conexión e intenta de nuevo.",
      });
    }
  }

  function retry() {
    if (lastQuestion) void ask(lastQuestion);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Agente RUES — Usecroma</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Preguntá en lenguaje natural sobre entidades registradas en el RUES de Colombia.
        </p>
      </div>

      <ChatBox onSubmit={ask} loading={view.kind === "loading"} />

      {view.kind === "loading" && <LoadingState />}

      {view.kind === "network-error" && <ErrorState message={view.message} onRetry={retry} />}

      {view.kind === "result" && view.response.status === "error" && (
        <ErrorState message={view.response.answer} onRetry={retry} />
      )}

      {view.kind === "result" && view.response.status !== "error" && (
        <>
          <AnswerCard response={view.response} />
          <TracePanel sources={view.response.sources} />
        </>
      )}
    </main>
  );
}
