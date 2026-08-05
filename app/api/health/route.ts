import { NextResponse } from "next/server";

// TODO(fase d): reportar también si CROMA_API_KEY y GEMINI_API_KEY están presentes,
// sin revelar su valor (ver docs/BACKEND.md).
export async function GET() {
  return NextResponse.json({ ok: true });
}
