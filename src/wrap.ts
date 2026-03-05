import type { ToolDefinition, XmlifyOptions } from "./types.js";
import { toolsToXmlSchema } from "./schema-to-xml.js";
import { jsonToXml } from "./json-to-xml.js";
import { parseToolCalls } from "./xml-to-json.js";

/**
 * High-level wrapper that creates an xmlify session for a set of tools.
 *
 * Usage:
 * ```ts
 * import { xmlify } from 'xmlify-tools'
 *
 * const session = xmlify(myTools)
 *
 * // Inject this into system prompt so model sees XML schemas
 * const systemPromptAddition = session.toolSchemaXml
 *
 * // After tool execution, convert result to XML for the model
 * const xmlResult = session.formatResult("browser", { status: "ok", url: "..." })
 *
 * // Parse model's XML tool call response back to JSON
 * const calls = session.parseResponse(modelOutputText)
 * ```
 */
export function xmlify(tools: ToolDefinition[], options: XmlifyOptions = {}) {
  const toolSchemaXml = toolsToXmlSchema(tools, options);

  const instructionBlock = [
    "You have access to the following tools. Tool schemas are defined in XML format.",
    "When you want to call a tool, respond with a <tool_call> XML block:",
    "",
    '<tool_call name="tool_name">',
    "  <param_name>value</param_name>",
    "</tool_call>",
    "",
    "Available tools:",
    "",
    toolSchemaXml,
  ].join("\n");

  return {
    /** XML schema definitions for all tools — inject into system prompt */
    toolSchemaXml,

    /** Full instruction block with usage instructions + schemas */
    instructionBlock,

    /** Convert a tool result to XML for the model */
    formatResult(toolName: string, result: unknown): string {
      return jsonToXml(result, {
        ...options,
        resultRoot: `${toolName}_result`,
      });
    },

    /** Parse tool calls from the model's XML response */
    parseResponse(text: string) {
      return parseToolCalls(text, tools);
    },
  };
}
