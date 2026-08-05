// Loop de function calling con Gemini (ver docs/AGENT_GEMINI.md, "Loop de function calling" y
// "Guardrails"). `run(question)` siempre devuelve un AgentResponse — nunca lanza — para que
// app/api/agent/route.ts (fase d) solo tenga que reenviarlo.

import type { Content, Part } from "@google/genai";
import { generateTurn } from "@/lib/agent/gemini-client";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { getEnv } from "@/lib/config/env";
import { executeTool, getToolDeclarations, hasTool } from "@/lib/tools/tool-registry";
import type { AgentResponse, AgentStatus, ToolTrace } from "@/lib/types/agent";

// Timeout global del turno (ver docs/AGENT_GEMINI.md, "Guardrails") — más margen que el timeout
// individual de Croma (CROMA_TIMEOUT_MS, default 15s).
const TURN_TIMEOUT_MS = 30_000;

interface ToolResultShape {
  ok?: boolean;
  simulated?: boolean;
  error?: { category: string; message: string };
  results?: unknown[];
  capped?: boolean;
  found?: boolean;
  razon_social?: string | null;
}

function asToolResultShape(value: unknown): ToolResultShape {
  return typeof value === "object" && value !== null ? (value as ToolResultShape) : {};
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function buildToolTrace(
  name: string,
  params: Record<string, unknown>,
  rawResult: unknown,
  durationMs: number,
): ToolTrace {
  const result = asToolResultShape(rawResult);
  const ok = result.ok === true;

  let summary: string;
  if (!ok) {
    summary = result.error?.message ?? "Error desconocido al ejecutar la herramienta";
  } else if (name === "buscar_entidad_rues") {
    const count = Array.isArray(result.results) ? result.results.length : 0;
    summary =
      count === 0
        ? "0 coincidencias encontradas (sin resultados)"
        : `${count} coincidencia(s) encontrada(s)` +
          (result.capped ? " — búsqueda truncada, se recomienda precisar el nombre" : "");
  } else if (name === "detalle_entidad_rues") {
    summary = result.found
      ? `Entidad encontrada: ${result.razon_social ?? "(sin razón social)"} — found: true`
      : "No se encontró ninguna entidad con ese NIT — found: false";
  } else {
    summary = "Ejecutada correctamente";
  }

  if (result.simulated) {
    summary = `[SIMULADO] ${summary}`;
  }

  return { tool: name, params, status: ok ? "ok" : "error", summary, duration_ms: durationMs };
}

function toFunctionResponsePayload(rawResult: unknown): Record<string, unknown> {
  const result = asToolResultShape(rawResult);
  if (result.ok === false) {
    return { error: result.error ?? { message: "Error desconocido" } };
  }
  return { output: rawResult as Record<string, unknown> };
}

function computeStatus(sources: ToolTrace[]): AgentStatus {
  if (sources.length === 0) return "no_data";

  const anyError = sources.some((s) => s.status === "error");
  const anyOk = sources.some((s) => s.status === "ok");

  if (anyError && anyOk) return "partial";
  if (anyError) return "error";

  const lastOk = [...sources].reverse().find((s) => s.status === "ok");
  if (lastOk && /found: false|sin resultados/i.test(lastOk.summary)) return "no_data";

  return "ok";
}

function computeLimitations(sources: ToolTrace[]): string[] {
  const limitations = sources
    .filter((s) => s.status === "error")
    .map((s) => `${s.tool}: ${s.summary}`);

  if (sources.some((s) => s.summary.startsWith("[SIMULADO]"))) {
    limitations.push(
      "Los datos mostrados son simulados (CROMA_MOCK=true) porque no hay una CROMA_API_KEY real " +
        "configurada; no provienen de RUES en vivo.",
    );
  }

  return limitations;
}

function buildErrorResponse(answer: string, sources: ToolTrace[], extraLimitation: string): AgentResponse {
  return { answer, sources, limitations: [...computeLimitations(sources), extraLimitation], status: "error" };
}

export async function run(question: string): Promise<AgentResponse> {
  const env = getEnv();
  const maxIterations = env.agentMaxToolCalls;
  const toolDeclarations = getToolDeclarations();

  const contents: Content[] = [{ role: "user", parts: [{ text: question }] }];
  const sources: ToolTrace[] = [];
  const calledSignatures = new Set<string>();

  const deadline = Date.now() + TURN_TIMEOUT_MS;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return buildErrorResponse(
        "No fue posible completar la consulta porque se superó el tiempo máximo de espera.",
        sources,
        "El turno superó el límite de 30 segundos.",
      );
    }

    let turn;
    try {
      turn = await withTimeout(generateTurn(contents, SYSTEM_PROMPT, toolDeclarations), remainingMs);
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === "timeout";
      return buildErrorResponse(
        isTimeout
          ? "No fue posible completar la consulta porque se superó el tiempo máximo de espera."
          : "No fue posible completar la consulta debido a un error del servicio de IA.",
        sources,
        isTimeout ? "El turno superó el límite de 30 segundos." : "Error al comunicarse con Gemini.",
      );
    }

    if (turn.functionCalls.length === 0) {
      const answer = (turn.text ?? "").trim();
      if (answer.length === 0) {
        return buildErrorResponse(
          "No fue posible generar una respuesta.",
          sources,
          "El modelo no devolvió texto ni solicitó ninguna herramienta.",
        );
      }
      return { answer, sources, limitations: computeLimitations(sources), status: computeStatus(sources) };
    }

    contents.push({
      role: "model",
      parts: turn.functionCalls.map((call) => ({ functionCall: { name: call.name, args: call.args } })),
    });

    const responseParts: Part[] = [];

    for (const call of turn.functionCalls) {
      if (!hasTool(call.name)) {
        responseParts.push({
          functionResponse: { name: call.name, response: { error: { message: "Herramienta desconocida" } } },
        });
        continue;
      }

      const signature = `${call.name}:${JSON.stringify(call.args)}`;
      if (calledSignatures.has(signature)) {
        responseParts.push({
          functionResponse: {
            name: call.name,
            response: { error: { message: "Esta herramienta ya fue llamada con los mismos parámetros en este turno" } },
          },
        });
        continue;
      }
      calledSignatures.add(signature);

      const start = Date.now();
      let result: unknown;
      try {
        result = await executeTool(call.name, call.args);
      } catch {
        result = {
          ok: false,
          error: { category: "croma_internal_error", message: "Error inesperado ejecutando la herramienta" },
        };
      }
      const durationMs = Date.now() - start;

      sources.push(buildToolTrace(call.name, call.args, result, durationMs));
      responseParts.push({ functionResponse: { name: call.name, response: toFunctionResponsePayload(result) } });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  return buildErrorResponse(
    "No fue posible completar la consulta: se alcanzó el máximo de herramientas encadenadas sin obtener una respuesta final.",
    sources,
    "El agente no pudo concluir dentro del límite de llamadas a herramientas permitido (AGENT_MAX_TOOL_CALLS).",
  );
}
