import { describe, it, expect } from "vitest";
import { parseToolCalls } from "./xml-to-json.js";
import type { ToolDefinition } from "./types.js";

const tools: ToolDefinition[] = [
  {
    name: "browser",
    description: "Browse a URL",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        wait: { type: "number" },
        headless: { type: "boolean" },
      },
      required: ["url"],
    },
  },
  {
    name: "search",
    description: "Search the web",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["query"],
    },
  },
];

describe("parseToolCalls", () => {
  it("parses a single tool call", () => {
    const xml = `
      I'll browse that page for you.

      <tool_call name="browser">
        <url>https://example.com</url>
        <wait>3</wait>
        <headless>true</headless>
      </tool_call>
    `;

    const calls = parseToolCalls(xml, tools);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("browser");
    expect(calls[0].arguments.url).toBe("https://example.com");
    expect(calls[0].arguments.wait).toBe(3);
    expect(calls[0].arguments.headless).toBe(true);
  });

  it("parses multiple tool calls", () => {
    const xml = `
      Let me search and then browse.

      <tool_call name="search">
        <query>vitest testing</query>
        <limit>5</limit>
      </tool_call>

      <tool_call name="browser">
        <url>https://vitest.dev</url>
      </tool_call>
    `;

    const calls = parseToolCalls(xml, tools);
    expect(calls).toHaveLength(2);
    expect(calls[0].name).toBe("search");
    expect(calls[0].arguments.query).toBe("vitest testing");
    expect(calls[0].arguments.limit).toBe(5);
    expect(calls[1].name).toBe("browser");
    expect(calls[1].arguments.url).toBe("https://vitest.dev");
  });

  it("handles escaped XML content", () => {
    const xml = `
      <tool_call name="search">
        <query>a &lt; b &amp; c</query>
      </tool_call>
    `;

    const calls = parseToolCalls(xml, tools);
    expect(calls[0].arguments.query).toBe("a < b & c");
  });

  it("handles unknown tool gracefully (no schema coercion)", () => {
    const xml = `
      <tool_call name="unknown_tool">
        <foo>bar</foo>
        <count>42</count>
      </tool_call>
    `;

    const calls = parseToolCalls(xml, tools);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("unknown_tool");
    expect(calls[0].arguments.foo).toBe("bar");
    expect(calls[0].arguments.count).toBe(42); // auto-coerced via inference
  });

  it("returns empty array when no tool calls found", () => {
    const calls = parseToolCalls("Just a regular text response.", tools);
    expect(calls).toHaveLength(0);
  });
});
