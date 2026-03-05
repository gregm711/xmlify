import type { JsonSchema, ParsedToolCall, ToolDefinition } from "./types.js";

/**
 * Parse tool calls from the model's XML response text.
 *
 * Expects the model to emit tool calls like:
 * ```xml
 * <tool_call name="browser">
 *   <url>https://example.com</url>
 *   <action>click</action>
 * </tool_call>
 * ```
 *
 * Returns parsed JSON objects with typed values (using the schema
 * to coerce strings to numbers/booleans where appropriate).
 */
export function parseToolCalls(
  xmlText: string,
  tools: ToolDefinition[],
): ParsedToolCall[] {
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const calls: ParsedToolCall[] = [];

  // Match all <tool_call> blocks
  const callPattern =
    /<tool_call\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tool_call>/g;
  let match: RegExpExecArray | null;

  while ((match = callPattern.exec(xmlText)) !== null) {
    const name = match[1];
    const body = match[2];
    const tool = toolMap.get(name);
    const schema = tool?.parameters;
    const args = parseXmlElement(body, schema);
    calls.push({ name, arguments: args });
  }

  return calls;
}

/**
 * Parse a single XML element body into a JSON object,
 * using the schema to coerce types.
 */
function parseXmlElement(
  xmlBody: string,
  schema?: JsonSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Match self-closing tags: <name/> or <name attr/>
  const selfClosingPattern =
    /<([a-zA-Z_][a-zA-Z0-9_.-]*)(?:\s[^>]*)?\s*\/>/g;
  let match: RegExpExecArray | null;

  while ((match = selfClosingPattern.exec(xmlBody)) !== null) {
    result[match[1]] = null;
  }

  // Match content tags: <name>...</name>
  // Use a function to find matching open/close pairs at the same nesting level
  const tagStartPattern = /<([a-zA-Z_][a-zA-Z0-9_.-]*)(?:\s[^>]*)?>(?!.*\/>)/g;

  // Simpler approach: match <name>content</name> allowing nested same-name tags
  const names = new Set<string>();
  const namePattern = /<([a-zA-Z_][a-zA-Z0-9_.-]*)(?:\s[^>]*)?>/g;
  while ((match = namePattern.exec(xmlBody)) !== null) {
    // Skip if this is inside a self-closing tag
    const before = xmlBody.substring(0, match.index + match[0].length);
    if (!before.endsWith("/>")) {
      names.add(match[1]);
    }
  }

  for (const name of names) {
    // Find first <name...>content</name> for this element name
    const contentPattern = new RegExp(
      `<${escapeRegex(name)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegex(name)}>`,
    );
    const contentMatch = contentPattern.exec(xmlBody);
    if (contentMatch) {
      const propSchema = schema?.properties?.[name];
      result[name] = parseValue(contentMatch[1], propSchema);
    }
  }

  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse a value from XML content, using schema for type coercion.
 */
function parseValue(content: string, schema?: JsonSchema): unknown {
  const trimmed = content.trim();

  // Object type — recurse
  if (schema?.type === "object" && schema.properties) {
    return parseXmlElement(trimmed, schema);
  }

  // Array type — collect <item> children
  if (schema?.type === "array") {
    return parseArray(trimmed, schema.items);
  }

  // If content contains child elements and no explicit schema, try object parse
  if (/<[a-zA-Z_]/.test(trimmed) && !schema?.type) {
    // Could be array of <item> or nested object
    if (/<item[\s>\/]/.test(trimmed)) {
      return parseArray(trimmed, undefined);
    }
    return parseXmlElement(trimmed, schema);
  }

  // Scalar — coerce based on schema type
  return coerceScalar(trimmed, schema);
}

function parseArray(content: string, itemSchema?: JsonSchema): unknown[] {
  const items: unknown[] = [];

  // Match <item> elements
  const itemPattern = /<item(?:\s[^>]*)?\s*\/>|<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(content)) !== null) {
    if (match[1] === undefined) {
      items.push(null); // self-closing <item/>
    } else {
      items.push(parseValue(match[1], itemSchema));
    }
  }

  return items;
}

function coerceScalar(value: string, schema?: JsonSchema): unknown {
  const unescaped = unescapeXml(value);

  if (!schema?.type) {
    // Best-effort type inference
    if (unescaped === "true") return true;
    if (unescaped === "false") return false;
    if (unescaped === "null" || unescaped === "") return null;
    const num = Number(unescaped);
    if (!isNaN(num) && unescaped !== "") return num;
    return unescaped;
  }

  switch (schema.type) {
    case "number":
    case "integer":
      return Number(unescaped);
    case "boolean":
      return unescaped === "true" || unescaped === "1";
    case "null":
      return null;
    default:
      return unescaped;
  }
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
