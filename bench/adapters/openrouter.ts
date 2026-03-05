import type { Message, ModelAdapter, ModelResponse } from "../types.js";
import type { ToolDefinition } from "../../src/types.js";

/**
 * OpenRouter adapter — routes to any model via OpenRouter's unified API.
 *
 * Set OPENROUTER_API_KEY in env.
 *
 * Usage:
 *   import { createOpenRouterAdapter } from "./adapters/openrouter.js"
 *   const model = await createOpenRouterAdapter("google/gemini-3.1-flash-lite-preview")
 */
export async function createOpenRouterAdapter(
  modelId: string,
): Promise<ModelAdapter> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Set OPENROUTER_API_KEY in env");

  const baseUrl = "https://openrouter.ai/api/v1";

  async function call(
    messages: Message[],
    tools?: ToolDefinition[],
  ): Promise<ModelResponse> {
    const body: Record<string, unknown> = {
      model: modelId,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: 4096,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const start = Date.now();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/gregm711/xmlify",
        "X-Title": "xmlify-bench",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      choices: {
        message: {
          content?: string | null;
          tool_calls?: {
            type: string;
            function: { name: string; arguments: string };
          }[];
        };
      }[];
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
      };
    };

    const choice = data.choices?.[0];
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
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
          }
        : undefined,
      latencyMs: Date.now() - start,
    };
  }

  // Short display name for reports
  const shortName = modelId.split("/").pop() ?? modelId;

  return {
    name: shortName,

    async callWithTools(
      messages: Message[],
      tools: ToolDefinition[],
    ): Promise<ModelResponse> {
      return call(messages, tools);
    },

    async callText(messages: Message[]): Promise<ModelResponse> {
      return call(messages);
    },
  };
}
