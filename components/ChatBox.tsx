// Campo de pregunta + botón "Preguntar" (ver docs/FRONTEND.md).
// Botón alineado a la derecha del campo de texto (feedback de usuario, fase e). Enter envía la
// pregunta; Shift+Enter inserta un salto de línea (convención estándar de apps de chat).
"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

interface ChatBoxProps {
  onSubmit: (question: string) => void;
  loading: boolean;
}

export default function ChatBox({ onSubmit, loading }: ChatBoxProps) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setValue("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escribe tu pregunta sobre el RUES..."
        disabled={loading}
        rows={1}
        className="max-h-40 min-h-[46px] w-full flex-1 resize-none overflow-y-auto rounded-lg border border-zinc-300 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <button
        type="submit"
        disabled={loading || value.trim().length === 0}
        className="h-[46px] shrink-0 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {loading ? "Consultando…" : "Preguntar"}
      </button>
    </form>
  );
}
