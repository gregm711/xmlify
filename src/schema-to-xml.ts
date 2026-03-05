import type { JsonSchema, ToolDefinition, XmlifyOptions } from "./types.js";

/**
 * Convert a JSON Schema tool definition into an XML schema description
 * that a model can understand. This produces a human/model-readable
 * XML template showing the expected structure.
 *
 * Example output:
 * ```xml
 * <tool name="browser" description="Browse a URL">
 *   <parameters>
 *     <url type="string" required="true">The URL to browse</url>
 *     <action type="string" enum="click,type,scroll">Action to perform</action>
 *   </parameters>
 * </tool>
 * ```
 */
export function toolToXmlSchema(
  tool: ToolDefinition,
  options: XmlifyOptions = {},
): string {
  const indent = options.indent ?? 2;
  const pad = (depth: number) => " ".repeat(depth * indent);

  const lines: string[] = [];
  lines.push(
    `<tool name="${escapeAttr(tool.name)}" description="${escapeAttr(tool.description)}">`,
  );
  lines.push(`${pad(1)}<parameters>`);

  if (tool.parameters.properties) {
    const required = new Set(tool.parameters.required ?? []);
    for (const [key, schema] of Object.entries(tool.parameters.properties)) {
      const paramXml = schemaPropertyToXml(
        key,
        schema,
        required.has(key),
        2,
        indent,
        options,
      );
      lines.push(paramXml);
    }
  }

  lines.push(`${pad(1)}</parameters>`);
  lines.push(`</tool>`);

  return lines.join("\n");
}

/**
 * Convert multiple tool definitions to XML.
 */
export function toolsToXmlSchema(
  tools: ToolDefinition[],
  options: XmlifyOptions = {},
): string {
  const parts = tools.map((t) => toolToXmlSchema(t, options));
  return `<tools>\n${parts.map((p) => indentBlock(p, options.indent ?? 2)).join("\n")}\n</tools>`;
}

function schemaPropertyToXml(
  name: string,
  schema: JsonSchema,
  isRequired: boolean,
  depth: number,
  indentSize: number,
  options: XmlifyOptions,
): string {
  const pad = " ".repeat(depth * indentSize);
  const attrs: string[] = [];

  if (options.typeHints && schema.type) {
    attrs.push(`type="${escapeAttr(schema.type)}"`);
  }
  if (isRequired) {
    attrs.push(`required="true"`);
  }
  if (schema.enum) {
    attrs.push(`enum="${escapeAttr(schema.enum.join(","))}"`);
  }
  if (schema.default !== undefined) {
    attrs.push(`default="${escapeAttr(String(schema.default))}"`);
  }

  const attrStr = attrs.length > 0 ? " " + attrs.join(" ") : "";

  // Object type — recurse into properties
  if (schema.type === "object" && schema.properties) {
    const lines: string[] = [];
    lines.push(`${pad}<${name}${attrStr}>`);
    const required = new Set(schema.required ?? []);
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      lines.push(
        schemaPropertyToXml(
          key,
          childSchema,
          required.has(key),
          depth + 1,
          indentSize,
          options,
        ),
      );
    }
    lines.push(`${pad}</${name}>`);
    return lines.join("\n");
  }

  // Array type — show item template
  if (schema.type === "array" && schema.items) {
    const lines: string[] = [];
    lines.push(`${pad}<${name}${attrStr}>`);
    lines.push(
      schemaPropertyToXml(
        "item",
        schema.items,
        false,
        depth + 1,
        indentSize,
        options,
      ),
    );
    lines.push(`${pad}</${name}>`);
    return lines.join("\n");
  }

  // Leaf node — description as text content
  const desc = schema.description ? escapeXml(schema.description) : "";
  return `${pad}<${name}${attrStr}>${desc}</${name}>`;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function indentBlock(block: string, size: number): string {
  const pad = " ".repeat(size);
  return block
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}
