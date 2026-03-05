import type { XmlifyOptions } from "./types.js";

/**
 * Convert a JSON value to XML. Used for serializing tool results
 * before sending them back to the model.
 *
 * Example:
 *   jsonToXml({ status: "ok", items: [1, 2] }, { resultRoot: "result" })
 *
 * Produces:
 *   <result>
 *     <status>ok</status>
 *     <items>
 *       <item>1</item>
 *       <item>2</item>
 *     </items>
 *   </result>
 */
export function jsonToXml(
  value: unknown,
  options: XmlifyOptions = {},
): string {
  const root = options.resultRoot ?? "result";
  const indent = options.indent ?? 2;
  return `<${root}>\n${valueToXml(value, 1, indent)}\n</${root}>`;
}

function valueToXml(value: unknown, depth: number, indentSize: number): string {
  const pad = " ".repeat(depth * indentSize);

  if (value === null || value === undefined) {
    return `${pad}<null/>`;
  }

  if (typeof value === "string") {
    return escapeXml(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    return value
      .map((item) => {
        const inner = valueToXml(item, depth + 1, indentSize);
        // If inner is a simple scalar (no newlines, no child tags), keep inline
        if (!inner.includes("\n") && !inner.includes("<")) {
          return `${pad}<item>${inner}</item>`;
        }
        return `${pad}<item>\n${inner}\n${pad}</item>`;
      })
      .join("\n");
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const entries = Object.entries(obj);
    if (entries.length === 0) return "";

    return entries
      .map(([key, val]) => {
        const safeName = sanitizeTagName(key);
        const inner = valueToXml(val, depth + 1, indentSize);

        // Array values get wrapped differently
        if (Array.isArray(val)) {
          if (val.length === 0) return `${pad}<${safeName}/>`;
          return `${pad}<${safeName}>\n${inner}\n${pad}</${safeName}>`;
        }

        // Nested object
        if (val !== null && typeof val === "object") {
          return `${pad}<${safeName}>\n${inner}\n${pad}</${safeName}>`;
        }

        // Scalar
        if (val === null || val === undefined) {
          return `${pad}<${safeName}/>`;
        }

        return `${pad}<${safeName}>${inner}</${safeName}>`;
      })
      .join("\n");
  }

  return escapeXml(String(value));
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Sanitize a string to be a valid XML tag name.
 * Replace invalid chars with underscore, ensure starts with letter.
 */
function sanitizeTagName(name: string): string {
  let safe = name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  if (!/^[a-zA-Z_]/.test(safe)) {
    safe = "_" + safe;
  }
  return safe;
}
