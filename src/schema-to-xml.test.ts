import { describe, it, expect } from "vitest";
import { toolToXmlSchema, toolsToXmlSchema } from "./schema-to-xml.js";
import type { ToolDefinition } from "./types.js";

const browserTool: ToolDefinition = {
  name: "browser",
  description: "Browse a URL and interact with the page",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to navigate to" },
      action: {
        type: "string",
        description: "Action to perform",
        enum: ["click", "type", "scroll"],
      },
      selector: { type: "string", description: "CSS selector for the target element" },
    },
    required: ["url"],
  },
};

describe("toolToXmlSchema", () => {
  it("converts a tool definition to XML schema", () => {
    const xml = toolToXmlSchema(browserTool);
    expect(xml).toContain('<tool name="browser"');
    expect(xml).toContain("<parameters>");
    expect(xml).toContain('<url required="true">');
    expect(xml).toContain('enum="click,type,scroll"');
    expect(xml).toContain("</tool>");
  });

  it("includes type hints when option enabled", () => {
    const xml = toolToXmlSchema(browserTool, { typeHints: true });
    expect(xml).toContain('type="string"');
  });

  it("handles nested object properties", () => {
    const tool: ToolDefinition = {
      name: "create_file",
      description: "Create a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          metadata: {
            type: "object",
            properties: {
              author: { type: "string", description: "Author name" },
              tags: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["author"],
          },
        },
        required: ["path"],
      },
    };

    const xml = toolToXmlSchema(tool);
    expect(xml).toContain("<metadata>");
    expect(xml).toContain('<author required="true">');
    expect(xml).toContain("<tags>");
    expect(xml).toContain("<item>");
    expect(xml).toContain("</metadata>");
  });
});

describe("toolsToXmlSchema", () => {
  it("wraps multiple tools in <tools> root", () => {
    const tools: ToolDefinition[] = [
      browserTool,
      {
        name: "search",
        description: "Search the web",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
      },
    ];

    const xml = toolsToXmlSchema(tools);
    expect(xml).toContain("<tools>");
    expect(xml).toContain("</tools>");
    expect(xml).toContain('name="browser"');
    expect(xml).toContain('name="search"');
  });
});
