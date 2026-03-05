import { describe, it, expect } from "vitest";
import { xmlify } from "./wrap.js";
import type { ToolDefinition } from "./types.js";

const tools: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read a file from disk",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
        encoding: { type: "string", description: "File encoding", default: "utf-8" },
      },
      required: ["path"],
    },
  },
];

describe("xmlify", () => {
  it("creates a session with toolSchemaXml", () => {
    const session = xmlify(tools);
    expect(session.toolSchemaXml).toContain("<tools>");
    expect(session.toolSchemaXml).toContain('name="read_file"');
  });

  it("creates an instruction block with usage guide", () => {
    const session = xmlify(tools);
    expect(session.instructionBlock).toContain("tool_call");
    expect(session.instructionBlock).toContain("<tools>");
  });

  it("formats results as XML", () => {
    const session = xmlify(tools);
    const xml = session.formatResult("read_file", {
      content: "hello world",
      bytes: 11,
    });
    expect(xml).toContain("<read_file_result>");
    expect(xml).toContain("<content>hello world</content>");
    expect(xml).toContain("<bytes>11</bytes>");
    expect(xml).toContain("</read_file_result>");
  });

  it("parses model responses", () => {
    const session = xmlify(tools);
    const calls = session.parseResponse(`
      <tool_call name="read_file">
        <path>/tmp/test.txt</path>
      </tool_call>
    `);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("read_file");
    expect(calls[0].arguments.path).toBe("/tmp/test.txt");
  });

  it("roundtrips: schema → model response → parsed JSON", () => {
    const session = xmlify(tools);

    // Verify schema contains the tool
    expect(session.toolSchemaXml).toContain("read_file");

    // Simulate model responding with a tool call
    const modelResponse = `
      I'll read that file for you.

      <tool_call name="read_file">
        <path>src/index.ts</path>
        <encoding>utf-8</encoding>
      </tool_call>
    `;

    const calls = session.parseResponse(modelResponse);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      name: "read_file",
      arguments: {
        path: "src/index.ts",
        encoding: "utf-8",
      },
    });

    // Format a result back
    const resultXml = session.formatResult("read_file", {
      content: 'export const x = 1;',
      bytes: 19,
    });
    expect(resultXml).toContain("<read_file_result>");
    expect(resultXml).toContain("export const x = 1;");
  });
});
