// Interfaz de consulta, formato chat, sin recarga entre consultas (ver docs/FRONTEND.md).
// Cada pregunta pasa por su propio ciclo loading -> (done con status ok/partial/no_data/error |
// network-error); las respuestas anteriores quedan visibles en el historial (no vuelven a
// "idle" ni se reemplazan) — ver components/ChatMessage.tsx para la aclaración sobre por qué
// esto es solo historial visual, no memoria conversacional real del agente.
"use client";

import { useEffect, useRef, useState } from "react";
import ChatBox from "@/components/ChatBox";
import ChatMessage, { type Exchange } from "@/components/ChatMessage";
import PageLoader from "@/components/PageLoader";
import type { AgentResponse } from "@/lib/types/agent";

let nextExchangeId = 0;

export default function Home() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [showLoader, setShowLoader] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [exchanges]);

  async function ask(question: string) {
    const id = nextExchangeId++;
    setExchanges((prev) => [...prev, { id, question, status: "loading" }]);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = (await res.json()) as AgentResponse;
      setExchanges((prev) =>
        prev.map((exchange) => (exchange.id === id ? { ...exchange, status: "done", response: body } : exchange)),
      );
    } catch {
      setExchanges((prev) =>
        prev.map((exchange) =>
          exchange.id === id
            ? {
                ...exchange,
                status: "network-error",
                errorMessage: "No fue posible conectar con el servidor. Verifica tu conexión e intenta de nuevo.",
              }
            : exchange,
        ),
      );
    }
  }

  function retry(question: string) {
    void ask(question);
  }

  const isLoading = exchanges.some((exchange) => exchange.status === "loading");

  return (
    <div className="flex h-dvh flex-col">
      {showLoader && <PageLoader onComplete={() => setShowLoader(false)} />}

      <header className="border-b border-zinc-200 p-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Agente RUES — Usecroma</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Pregunta en lenguaje natural sobre entidades registradas en el RUES de Colombia.
        </p>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
          {exchanges.length === 0 && (
            <p className="pt-10 text-center text-sm text-zinc-400 dark:text-zinc-500">
              Haz tu primera pregunta abajo para empezar.
            </p>
          )}
          {exchanges.map((exchange) => (
            <ChatMessage key={exchange.id} exchange={exchange} onRetry={retry} />
          ))}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
        <div className="mx-auto w-full max-w-2xl">
          <ChatBox onSubmit={ask} loading={isLoading} />
        </div>
      </footer>
    </div>
  );
}
