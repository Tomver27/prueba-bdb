// Wrapper delgado sobre el SDK @google/genai (ver docs/AGENT_GEMINI.md).
//
// Reutiliza los tipos `Content`/`FunctionDeclaration` del SDK en vez de redefinirlos — este
// módulo solo arma la llamada a `generateContent` y normaliza la respuesta a algo mínimo que
// orchestrator.ts pueda consumir sin acoplarse al resto de la superficie del SDK.

import { GoogleGenAI, type Content, type FunctionDeclaration } from "@google/genai";
import { getEnv } from "@/lib/config/env";
import type { ToolDeclaration } from "@/lib/tools/tool-registry";

// Modelo del tier gratuito con soporte de function calling (ver docs/AGENT_GEMINI.md).
// Confirmar disponibilidad en Google AI Studio al desplegar — la disponibilidad del tier
// gratuito cambia con el tiempo.
export const GEMINI_MODEL = "gemini-2.5-flash";

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

  return { text: response.text, functionCalls };
}
