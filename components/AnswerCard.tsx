// Respuesta del agente: answer + limitations en secciones separadas (ver docs/FRONTEND.md).
// No se renderiza cuando status es "error" — eso lo cubre ErrorState (ver components/ChatMessage.tsx).
//
// El texto de `answer` se revela palabra por palabra ("efecto de escritura") una vez que ya
// llegó completo del backend — no hay streaming real del servidor (ver docs/FRONTEND.md, "Fuera
// de alcance"): esto es puramente un efecto visual sobre datos que ya están completos, se
// reproduce una sola vez por respuesta (útil dado que el turno puede tardar hasta 30s, evita que
// el texto aparezca de golpe).
//
// `renderMarkdownLite` es un mini-renderer propio (negrita **texto** + listas con "-"/"*"/"1.")
// en vez de una librería de markdown — Gemini solo usa ese subconjunto en sus respuestas y así
// se evita sumar una dependencia nueva (ver docs/FRONTEND.md).
"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { AgentResponse } from "@/lib/types/agent";

interface AnswerCardProps {
  response: AgentResponse;
}

const STATUS_LABEL: Partial<Record<AgentResponse["status"], string>> = {
  no_data: "Sin resultados en RUES",
  partial: "Respuesta parcial",
};

function useTypewriter(text: string): { visibleText: string; done: boolean } {
  const words = text.length > 0 ? text.split(" ") : [];
  const [visibleCount, setVisibleCount] = useState(words.length > 0 ? 1 : 0);

  useEffect(() => {
    const totalWords = text.length > 0 ? text.split(" ").length : 0;
    if (totalWords <= 1) return;

    // Duración total acotada (~1.4s) sin importar el largo de la respuesta: respuestas cortas se
    // ven "escribiendo" a un ritmo natural, respuestas largas no hacen esperar de más al usuario.
    const intervalMs = Math.max(12, Math.min(45, 1400 / totalWords));

    const timer = setInterval(() => {
      setVisibleCount((count) => {
        const next = count + 1;
        if (next >= totalWords) clearInterval(timer);
        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [text]);

  return { visibleText: words.slice(0, visibleCount).join(" "), done: visibleCount >= words.length };
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*.+?\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyPrefix}-${index}`}>{part}</span>;
  });
}

function renderMarkdownLite(text: string): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    const items = listBuffer;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="list-disc space-y-1 pl-5">
        {items.map((item, index) => (
          <li key={index}>{renderInline(item, `li-${blocks.length}-${index}`)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  lines.forEach((line, index) => {
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const itemText = bulletMatch?.[1] ?? numberedMatch?.[1];

    if (itemText !== undefined) {
      listBuffer.push(itemText);
      return;
    }

    flushList();

    if (line.trim().length === 0) return;

    blocks.push(
      <p key={`p-${index}`} className="leading-6">
        {renderInline(line, `p-${index}`)}
      </p>,
    );
  });

  flushList();

  return <div className="flex flex-col gap-2">{blocks}</div>;
}

export default function AnswerCard({ response }: AnswerCardProps) {
  const badge = STATUS_LABEL[response.status];
  const { visibleText, done } = useTypewriter(response.answer);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {badge && (
        <span className="w-fit rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {badge}
        </span>
      )}

      <div className="text-sm text-zinc-800 dark:text-zinc-200">
        {renderMarkdownLite(visibleText)}
        {!done && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-zinc-400 align-middle dark:bg-zinc-500" />
        )}
      </div>

      {response.limitations.length > 0 && (
        <div
          className={`rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 transition-opacity duration-500 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 ${
            done ? "opacity-100" : "opacity-0"
          }`}
        >
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
