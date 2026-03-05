import type { Message, ModelAdapter, ModelResponse } from "../types.js";
import type { ToolDefinition } from "../../src/types.js";

/**
 * OpenAI adapter.
 *
 * Uses the OpenAI SDK. Install: `npm install openai`
 * Set OPENAI_API_KEY in env.
 *
 * Usage:
 *   import { createOpenAIAdapter } from "./adapters/openai.js"
 *   const model = await createOpenAIAdapter("gpt-4o-mini")
 */
export async function createOpenAIAdapter(
  modelId: string = "gpt-4o-mini",
): Promise<ModelAdapter> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI();

  return {
    name: modelId,

    async callWithTools(
      messages: Message[],
      tools: ToolDefinition[],
    ): Promise<ModelResponse> {
      const oaiMessages = messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));

      const oaiTools = tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      const start = Date.now();
      const response = await client.chat.completions.create({
        model: modelId,
        messages: oaiMessages,
        tools: oaiTools,
        max_tokens: 4096,
      });

      const choice = response.choices[0];
      const toolCalls: ModelResponse["toolCalls"] = [];

      if (choice?.message?.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          if (tc.type === "function") {
            try {
              toolCalls.push({
                name: tc.function.name,
                arguments: JSON.parse(tc.function.arguments),
              });
            } catch {
              toolCalls.push({
                name: tc.function.name,
                arguments: {},
              });
            }
          }
        }
      }

      return {
        text: choice?.message?.content ?? "",
        toolCalls,
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
            }
          : undefined,
        latencyMs: Date.now() - start,
      };
    },

    async callText(messages: Message[]): Promise<ModelResponse> {
      const oaiMessages = messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));

      const start = Date.now();
      const response = await client.chat.completions.create({
        model: modelId,
        messages: oaiMessages,
        max_tokens: 4096,
      });

      const choice = response.choices[0];
      return {
        text: choice?.message?.content ?? "",
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
            }
          : undefined,
        latencyMs: Date.now() - start,
      };
    },
  };
}
