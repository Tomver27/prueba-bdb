// Campo de pregunta + botón "Preguntar" (ver docs/FRONTEND.md).
"use client";

import { useState, type FormEvent } from "react";

interface ChatBoxProps {
  onSubmit: (question: string) => void;
  loading: boolean;
}

export default function ChatBox({ onSubmit, loading }: ChatBoxProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Ej: Busca información sobre ACME, o Dame el detalle del NIT 900123456"
        disabled={loading}
        rows={3}
        className="w-full resize-none rounded-lg border border-zinc-300 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <button
        type="submit"
        disabled={loading || value.trim().length === 0}
        className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {loading ? "Consultando…" : "Preguntar"}
      </button>
    </form>
  );
}
