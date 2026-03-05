import * as fs from "fs";
import type { BenchmarkSuite, TestCase } from "../types.js";
import type { ToolDefinition } from "../../src/types.js";

/**
 * Load a benchmark suite from a JSON file.
 *
 * Expected format:
 * {
 *   "name": "my-benchmark",
 *   "description": "...",
 *   "cases": [
 *     {
 *       "id": "case-1",
 *       "category": "simple",
 *       "tools": [{ "name": "...", "description": "...", "parameters": {...} }],
 *       "prompt": "...",
 *       "expected": [{ "name": "...", "arguments": {...} }]
 *     }
 *   ]
 * }
 *
 * Or a flat array of test cases (name defaults to filename).
 */
export function loadSuiteFromFile(filePath: string): BenchmarkSuite {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  // If it's an array, treat as cases
  if (Array.isArray(raw)) {
    const name = filePath.split("/").pop()?.replace(/\.json$/, "") ?? "custom";
    return { name, cases: raw.map(normalizeCase) };
  }

  return {
    name: raw.name ?? "custom",
    description: raw.description,
    cases: (raw.cases ?? []).map(normalizeCase),
  };
}

/**
 * Load a BFCL-format test file.
 *
 * BFCL stores one test per line as JSONL with:
 * { "id": "...", "question": [...], "function": [...], "ground_truth": [...] }
 */
export function loadBFCLFile(filePath: string): BenchmarkSuite {
  const lines = fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim());

  const cases: TestCase[] = [];

  for (const line of lines) {
    const raw = JSON.parse(line);
    const id = raw.id ?? `bfcl-${cases.length}`;

    // Extract tools from BFCL "function" field
    const tools: ToolDefinition[] = (raw.function ?? []).map((f: Record<string, unknown>) => ({
      name: (f.name as string) ?? "",
      description: (f.description as string) ?? "",
      parameters: f.parameters ?? { type: "object", properties: {} },
    }));

    // Extract prompt from BFCL "question" field
    const question = raw.question;
    const prompt = Array.isArray(question)
      ? question.map((q: { content?: string }) => q.content ?? "").join("\n")
      : typeof question === "string"
        ? question
        : JSON.stringify(question);

    // Extract expected from ground truth
    const groundTruth = raw.ground_truth ?? raw.expected ?? [];
    const expected = Array.isArray(groundTruth)
      ? groundTruth.map((gt: Record<string, unknown>) => ({
          name: (gt.name as string) ?? "",
          arguments: (gt.arguments ?? gt.args ?? {}) as Record<string, unknown>,
        }))
      : [];

    cases.push({
      id,
      category: raw.category ?? raw.test_category ?? undefined,
      tools,
      prompt,
      expected,
    });
  }

  const name = filePath.split("/").pop()?.replace(/\.jsonl?$/, "") ?? "bfcl";
  return { name, description: "Loaded from BFCL format", cases };
}

function normalizeCase(raw: Record<string, unknown>): TestCase {
  return {
    id: (raw.id as string) ?? "unknown",
    category: raw.category as string | undefined,
    tools: (raw.tools ?? []) as ToolDefinition[],
    prompt: (raw.prompt as string) ?? "",
    expected: (raw.expected ?? []) as TestCase["expected"],
  };
}
