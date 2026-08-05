// Wrapper delgado sobre el SDK @google/genai (ver docs/AGENT_GEMINI.md).
//
// Reutiliza los tipos `Content`/`FunctionDeclaration` del SDK en vez de redefinirlos — este
// módulo solo arma la llamada a `generateContent` y normaliza la respuesta a algo mínimo que
// orchestrator.ts pueda consumir sin acoplarse al resto de la superficie del SDK.

import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import { getEnv } from "@/lib/config/env";
import type { ToolDeclaration } from "@/lib/tools/tool-registry";

// Modelo del tier gratuito con soporte de function calling (ver docs/AGENT_GEMINI.md).
// Se usa el alias "-latest" en vez de una versión fija — confirmar de nuevo si esto vuelve a
// fallar, ya que Google reasigna a qué modelo concreto apunta el alias con el tiempo. Historial
// de verificación contra la API real (fase c/d, 2026-08-05):
//   - "gemini-2.5-flash" / "gemini-2.5-flash-lite": 404, ya no disponibles para cuentas nuevas.
//   - "gemini-flash-latest": funciona, pero resuelve a "gemini-3.6-flash", cuyo free tier tiene
//     un límite de solo 20 requests/día por proyecto (se agotó durante las pruebas de fase d).
//   - "gemini-flash-lite-latest": funciona y soporta function calling; se usa por defecto por
//     tener, en la práctica, más margen de cuota gratuita que el alias "flash" completo.
export const GEMINI_MODEL = "gemini-flash-lite-latest";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: getEnv().geminiApiKey });
  }
  return client;
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiTurnResult {
  text?: string;
  functionCalls: GeminiFunctionCall[];
  // Parts crudos del modelo tal como los devolvió la API (incluyen `thoughtSignature`). Deben
  // reenviarse sin modificar como el turno "model" del historial: reconstruir el `functionCall`
  // desde cero (sin su thoughtSignature) hace que Gemini rechace la siguiente llamada con
  // "Function call is missing a thought_signature" (verificado en fase c contra la API real).
  modelParts: Part[];
}

function toFunctionDeclaration(tool: ToolDeclaration): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters,
  };
}

export async function generateTurn(
  contents: Content[],
  systemInstruction: string,
  toolDeclarations: ToolDeclaration[],
): Promise<GeminiTurnResult> {
  const response = await getClient().models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: toolDeclarations.map(toFunctionDeclaration) }],
    },
  });

  const functionCalls = (response.functionCalls ?? []).map((call) => ({
    name: call.name ?? "",
    args: call.args ?? {},
  }));
  const modelParts = response.candidates?.[0]?.content?.parts ?? [];

  return { text: response.text, functionCalls, modelParts };
}
