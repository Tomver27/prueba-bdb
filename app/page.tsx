// Interfaz de consulta, formato chat, sin recarga entre consultas (ver docs/FRONTEND.md).
// Cada pregunta pasa por su propio ciclo loading -> (done con status ok/partial/no_data/error |
// network-error); las respuestas anteriores quedan visibles en el historial (no vuelven a
// "idle" ni se reemplazan) — ver components/ChatMessage.tsx para la aclaración sobre por qué
// esto es solo historial visual, no memoria conversacional real del agente.
//
// Persistencia en localStorage (agregado a pedido del usuario): el historial completo
// (pregunta + respuesta con sources/limitations) se guarda bajo CHAT_HISTORY_KEY y se restaura
// al montar. Nunca se guarda nada sensible (claves, headers) — solo el mismo AgentResponse que
// ya se muestra en pantalla, sin alterar el schema de docs/TRACEABILITY.md.
"use client";

import { useEffect, useRef, useState } from "react";
import ChatBox from "@/components/ChatBox";
import ChatMessage, { type Exchange } from "@/components/ChatMessage";
import PageLoader from "@/components/PageLoader";
import type { AgentResponse } from "@/lib/types/agent";

const CHAT_HISTORY_KEY = "croma-chat-history";

function loadStoredExchanges(): Exchange[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Exchange[]) : [];
  } catch {
    // JSON corrupto o localStorage no disponible (modo privado, cuota, etc.): arranca vacío.
    return [];
  }
}

export default function Home() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Hidratación: se lee localStorage solo en el cliente, después del montaje. Es intencional
  // que esto pase en un efecto y no durante el render: si se leyera localStorage de forma
  // síncrona en el render inicial, el resultado no coincidiría con el HTML que generó el
  // servidor (que nunca tiene acceso a localStorage) y React tiraría un error de hidratación.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura de localStorage post-montaje, no derivable durante el render sin romper la hidratación SSR.
    setExchanges(loadStoredExchanges());
    setHydrated(true);
  }, []);

  // Persistencia: se guarda cada vez que cambia el historial, ya hidratado. Los turnos en
  // "loading" se excluyen — si la página se recarga a mitad de una consulta, el fetch se cancela
  // igual, y guardarlo dejaría un turno "cargando" fantasma para siempre al volver a abrir.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      const toPersist = exchanges.filter((exchange) => exchange.status !== "loading");
      window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(toPersist));
    } catch {
      // TODO: si el historial crece mucho, truncar a los últimos N turnos ante un
      // QuotaExceededError en vez de simplemente descartar el guardado.
    }
  }, [exchanges, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [exchanges]);

  async function ask(question: string) {
    const id = Date.now();
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

  function clearChat() {
    const confirmed = window.confirm("¿Vaciar todo el historial de chat? Esta acción no se puede deshacer.");
    if (!confirmed) return;

    setExchanges([]);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(CHAT_HISTORY_KEY);
      } catch {
        // localStorage no disponible — el estado en memoria ya quedó vacío igual.
      }
    }
  }

  const isLoading = exchanges.some((exchange) => exchange.status === "loading");

  return (
    <div className="flex h-dvh flex-col">
      {showLoader && <PageLoader onComplete={() => setShowLoader(false)} />}

      <header className="flex items-start justify-between gap-4 border-b border-zinc-200 p-6 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Agente RUES — Usecroma</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Pregunta en lenguaje natural sobre entidades registradas en el RUES de Colombia.
          </p>
        </div>
        <button
          type="button"
          onClick={clearChat}
          disabled={exchanges.length === 0}
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Vaciar chat
        </button>
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
