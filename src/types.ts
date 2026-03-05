/**
 * Standard tool definition — compatible with OpenAI/Anthropic/Google formats.
 * This is the JSON the framework already has.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

/**
 * A JSON Schema object (subset we care about for tool parameters).
 */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: string[];
  default?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  /** Allow additional JSON Schema keywords passthrough */
  [key: string]: unknown;
}

/**
 * A parsed tool call extracted from the model's XML response.
 */
export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Options for XML generation.
 */
export interface XmlifyOptions {
  /** Include type hints as XML attributes. Default: false */
  typeHints?: boolean;
  /** Indent size for pretty printing. Default: 2 */
  indent?: number;
  /** Root element name for tool results. Default: "result" */
  resultRoot?: string;
}
