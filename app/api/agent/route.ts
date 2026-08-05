// POST /api/agent — único endpoint que el frontend consume (ver docs/BACKEND.md).
// Solo valida la entrada HTTP y delega en lib/agent/orchestrator.ts; nada de lógica de negocio
// acá (ver docs/STRUCTURE.md).

import { NextResponse } from "next/server";
import { run } from "@/lib/agent/orchestrator";
import type { AgentResponse } from "@/lib/types/agent";

const MAX_QUESTION_LENGTH = 2000;

function badRequest(message: string): NextResponse<AgentResponse> {
  return NextResponse.json(
    { answer: "", sources: [], limitations: [message], status: "error" },
    { status: 400 },
  );
}

function extractQuestion(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const question = (body as Record<string, unknown>).question;
  if (typeof question !== "string") return null;
  const trimmed = question.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request): Promise<NextResponse<AgentResponse>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("El cuerpo de la solicitud no es JSON válido.");
  }

  const question = extractQuestion(body);
  if (question === null) {
    return badRequest("El campo `question` es requerido y no puede estar vacío.");
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return badRequest(`El campo \`question\` supera el máximo de ${MAX_QUESTION_LENGTH} caracteres.`);
  }

  try {
    const agentResponse = await run(question);
    return NextResponse.json(agentResponse, { status: 200 });
  } catch {
    return NextResponse.json(
      { answer: "", sources: [], limitations: ["Error inesperado del servidor."], status: "error" },
      { status: 500 },
    );
  }
}
