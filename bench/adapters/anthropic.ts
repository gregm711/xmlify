import type { Message, ModelAdapter, ModelResponse } from "../types.js";
import type { ToolDefinition } from "../../src/types.js";

/**
 * Anthropic Claude adapter.
 *
 * Uses the Anthropic SDK. Install: `npm install @anthropic-ai/sdk`
 * Set ANTHROPIC_API_KEY in env.
 *
 * Usage:
 *   import { createAnthropicAdapter } from "./adapters/anthropic.js"
 *   const model = await createAnthropicAdapter("claude-sonnet-4-6")
 */
export async function createAnthropicAdapter(
  modelId: string = "claude-sonnet-4-6",
): Promise<ModelAdapter> {
  // Dynamic import so the SDK is optional
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  return {
    name: modelId,

    async callWithTools(
      messages: Message[],
      tools: ToolDefinition[],
    ): Promise<ModelResponse> {
      const { systemMsg, chatMessages } = splitMessages(messages);

      const anthropicTools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Record<string, unknown>,
      }));

      const start = Date.now();
      const response = await client.messages.create({
        model: modelId,
        max_tokens: 4096,
        system: systemMsg,
        messages: chatMessages,
        tools: anthropicTools,
      });

      const toolCalls: ModelResponse["toolCalls"] = [];
      let text = "";

      for (const block of response.content) {
        if (block.type === "tool_use") {
          toolCalls.push({
            name: block.name,
            arguments: (block.input ?? {}) as Record<string, unknown>,
          });
        } else if (block.type === "text") {
          text += block.text;
        }
      }

      return {
        text,
        toolCalls,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        latencyMs: Date.now() - start,
      };
    },

    async callText(messages: Message[]): Promise<ModelResponse> {
      const { systemMsg, chatMessages } = splitMessages(messages);

      const start = Date.now();
      const response = await client.messages.create({
        model: modelId,
        max_tokens: 4096,
        system: systemMsg,
        messages: chatMessages,
      });

      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");

      return {
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        latencyMs: Date.now() - start,
      };
    },
  };
}

function splitMessages(messages: Message[]): {
  systemMsg: string;
  chatMessages: { role: "user" | "assistant"; content: string }[];
} {
  let systemMsg = "";
  const chatMessages: { role: "user" | "assistant"; content: string }[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemMsg += (systemMsg ? "\n\n" : "") + m.content;
    } else if (m.role === "user" || m.role === "assistant") {
      chatMessages.push({ role: m.role, content: m.content });
    }
  }

  return { systemMsg, chatMessages };
}
