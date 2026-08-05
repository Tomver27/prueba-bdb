import { NextResponse } from "next/server";

// TODO(fase d): parsear y validar `question`, llamar a lib/agent/orchestrator.ts::run()
// y devolver el AgentResponse correspondiente (ver docs/BACKEND.md y docs/TRACEABILITY.md).
export async function POST() {
  return NextResponse.json(
    { answer: "", sources: [], limitations: ["Endpoint aún no implementado."], status: "error" },
    { status: 501 },
  );
}
