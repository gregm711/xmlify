import type { Message, ModelAdapter, ModelResponse } from "../types.js";
import type { ToolDefinition } from "../../src/types.js";

/**
 * Google Gemini adapter.
 *
 * Uses the Google GenAI SDK. Install: `npm install @google/genai`
 * Set GOOGLE_API_KEY or GEMINI_API_KEY in env.
 *
 * Usage:
 *   import { createGoogleAdapter } from "./adapters/google.js"
 *   const model = await createGoogleAdapter("gemini-2.5-flash")
 */
export async function createGoogleAdapter(
  modelId: string = "gemini-2.5-flash",
): Promise<ModelAdapter> {
  const { GoogleGenAI } = await import("@google/genai");
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Set GOOGLE_API_KEY or GEMINI_API_KEY");

  const client = new GoogleGenAI({ apiKey });

  return {
    name: modelId,

    async callWithTools(
      messages: Message[],
      tools: ToolDefinition[],
    ): Promise<ModelResponse> {
      const { systemMsg, userMsg } = flattenMessages(messages);

      const functionDeclarations = tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      const start = Date.now();
      const response = await client.models.generateContent({
        model: modelId,
        contents: userMsg,
        config: {
          systemInstruction: systemMsg || undefined,
          tools: [{ functionDeclarations }],
        },
      });

      const toolCalls: ModelResponse["toolCalls"] = [];
      let text = "";

      const candidate = response.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.functionCall) {
            toolCalls.push({
              name: part.functionCall.name ?? "",
              arguments: (part.functionCall.args ?? {}) as Record<string, unknown>,
            });
          } else if (part.text) {
            text += part.text;
          }
        }
      }

      return {
        text,
        toolCalls,
        usage: response.usageMetadata
          ? {
              inputTokens: response.usageMetadata.promptTokenCount ?? 0,
              outputTokens: response.usageMetadata.candidatesTokenCount ?? 0,
            }
          : undefined,
        latencyMs: Date.now() - start,
      };
    },

    async callText(messages: Message[]): Promise<ModelResponse> {
      const { systemMsg, userMsg } = flattenMessages(messages);

      const start = Date.now();
      const response = await client.models.generateContent({
        model: modelId,
        contents: userMsg,
        config: {
          systemInstruction: systemMsg || undefined,
        },
      });

      const text =
        response.candidates?.[0]?.content?.parts
          ?.filter((p): p is { text: string } => !!p.text)
          .map((p) => p.text)
          .join("") ?? "";

      return {
        text,
        usage: response.usageMetadata
          ? {
              inputTokens: response.usageMetadata.promptTokenCount ?? 0,
              outputTokens: response.usageMetadata.candidatesTokenCount ?? 0,
            }
          : undefined,
        latencyMs: Date.now() - start,
      };
    },
  };
}

function flattenMessages(messages: Message[]): {
  systemMsg: string;
  userMsg: string;
} {
  let systemMsg = "";
  let userMsg = "";

  for (const m of messages) {
    if (m.role === "system") {
      systemMsg += (systemMsg ? "\n\n" : "") + m.content;
    } else {
      userMsg += (userMsg ? "\n\n" : "") + m.content;
    }
  }

  return { systemMsg, userMsg };
}
