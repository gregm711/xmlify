import * as fs from "fs";
import * as path from "path";
import type { BenchmarkSuite, TestCase, ExpectedToolCall } from "../types.js";
import type { ToolDefinition, JsonSchema } from "../../src/types.js";

/**
 * Load BFCL v3 test data from the HuggingFace dataset format.
 *
 * Expects two files:
 *   - questionsFile: BFCL_v3_<category>.json (one JSON object per line)
 *   - answersFile:   BFCL_v3_<category>_answer.json (in possible_answer/ dir)
 *
 * Each question line:
 * {
 *   "id": "simple_0",
 *   "question": [[{"role": "user", "content": "..."}]],
 *   "function": [{ "name": "...", "description": "...", "parameters": { "type": "dict", ... } }]
 * }
 *
 * Each answer line:
 * {
 *   "id": "simple_0",
 *   "ground_truth": [{ "func_name": { "arg": [acceptable_value_1, acceptable_value_2] } }]
 * }
 */
export function loadBFCLv3(
  questionsFile: string,
  answersFile: string,
): BenchmarkSuite {
  const questions = readJsonLines(questionsFile);
  const answers = readJsonLines(answersFile);

  // Index answers by ID
  const answerMap = new Map<string, unknown[]>();
  for (const a of answers) {
    answerMap.set(a.id, a.ground_truth ?? []);
  }

  const category = path.basename(questionsFile)
    .replace(/^BFCL_v3_/, "")
    .replace(/\.json$/, "");

  const cases: TestCase[] = [];

  for (const q of questions) {
    const id = q.id as string;

    // Parse tools — fix "type": "dict" → "type": "object"
    const tools: ToolDefinition[] = (q.function ?? []).map(
      (f: Record<string, unknown>) => ({
        name: f.name as string,
        description: (f.description as string) ?? "",
        parameters: fixSchema(f.parameters as Record<string, unknown>),
      }),
    );

    // Parse prompt from nested question array
    const prompt = extractPrompt(q.question);

    // Parse ground truth into expected tool calls
    const groundTruth = answerMap.get(id) ?? [];
    const expected = parseGroundTruth(groundTruth);

    cases.push({
      id,
      category,
      tools,
      prompt,
      expected,
    });
  }

  return {
    name: `BFCL-v3-${category}`,
    description: `BFCL v3 ${category} (${cases.length} cases)`,
    cases,
  };
}

/**
 * Convenience: load a BFCL category from the bench/data/ directory.
 * Pass just the category name (e.g. "simple", "multiple").
 */
export function loadBFCLCategory(
  category: string,
  dataDir: string = path.join(import.meta.dirname, "..", "data"),
): BenchmarkSuite {
  const qFile = path.join(dataDir, `BFCL_v3_${category}.json`);
  const aFile = path.join(dataDir, `BFCL_v3_${category}_answer.json`);

  if (!fs.existsSync(qFile)) {
    throw new Error(`Questions file not found: ${qFile}\nRun the download script first.`);
  }
  if (!fs.existsSync(aFile)) {
    throw new Error(`Answers file not found: ${aFile}\nRun the download script first.`);
  }

  return loadBFCLv3(qFile, aFile);
}

/**
 * Load multiple BFCL categories and merge into one suite.
 */
export function loadBFCLCategories(
  categories: string[],
  dataDir?: string,
): BenchmarkSuite {
  const suites = categories.map((c) => loadBFCLCategory(c, dataDir));
  const allCases = suites.flatMap((s) => s.cases);

  return {
    name: `BFCL-v3-${categories.join("+")}`,
    description: `BFCL v3 combined: ${categories.join(", ")} (${allCases.length} cases)`,
    cases: allCases,
  };
}

// ---------------------------------------------------------------------------
// BFCL-specific parsing
// ---------------------------------------------------------------------------

function readJsonLines(filePath: string): Record<string, unknown>[] {
  return fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

/**
 * Extract the user prompt from BFCL's nested question format.
 * Format: [[{"role": "user", "content": "..."}]]
 */
function extractPrompt(question: unknown): string {
  if (!Array.isArray(question)) return String(question);

  // BFCL uses [[messages]] — take the first conversation
  const conversation = Array.isArray(question[0]) ? question[0] : question;

  return conversation
    .filter(
      (m: unknown): m is { content: string } =>
        typeof m === "object" && m !== null && "content" in m,
    )
    .map((m) => m.content)
    .join("\n");
}

/**
 * Fix BFCL schemas: "type": "dict" → "type": "object", recursively.
 */
function fixSchema(schema: Record<string, unknown>): JsonSchema {
  if (!schema) return { type: "object", properties: {} };

  const fixed: Record<string, unknown> = { ...schema };

  if (fixed.type === "dict") {
    fixed.type = "object";
  }

  // Recurse into properties
  if (fixed.properties && typeof fixed.properties === "object") {
    const props: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(
      fixed.properties as Record<string, unknown>,
    )) {
      if (val && typeof val === "object") {
        props[key] = fixSchema(val as Record<string, unknown>);
      } else {
        props[key] = val;
      }
    }
    fixed.properties = props;
  }

  // Recurse into items (arrays)
  if (fixed.items && typeof fixed.items === "object") {
    fixed.items = fixSchema(fixed.items as Record<string, unknown>);
  }

  return fixed as JsonSchema;
}

/**
 * Parse BFCL ground truth format into our ExpectedToolCall format.
 *
 * BFCL format:
 *   [{ "func_name": { "arg1": [acceptable_val_1, ...], "arg2": [...] } }]
 *
 * We convert to:
 *   [{ name: "func_name", arguments: { arg1: first_acceptable_val, ... } }]
 *
 * We store ALL acceptable values so the scorer can check any match.
 */
export function parseGroundTruth(
  groundTruth: unknown[],
): ExpectedToolCall[] {
  const calls: ExpectedToolCall[] = [];

  for (const entry of groundTruth) {
    if (!entry || typeof entry !== "object") continue;

    for (const [funcName, args] of Object.entries(
      entry as Record<string, unknown>,
    )) {
      if (!args || typeof args !== "object") {
        calls.push({ name: funcName, arguments: {} });
        continue;
      }

      // Convert { arg: [val1, val2] } → { arg: val1 } for primary comparison
      // Store full acceptable values in a metadata field for flexible scoring
      const primaryArgs: Record<string, unknown> = {};
      const acceptableValues: Record<string, unknown[]> = {};

      for (const [argName, vals] of Object.entries(
        args as Record<string, unknown>,
      )) {
        if (Array.isArray(vals)) {
          // Filter out empty strings — they mean "optional/default"
          const nonEmpty = vals.filter((v) => v !== "");
          primaryArgs[argName] = nonEmpty.length > 0 ? nonEmpty[0] : vals[0];
          acceptableValues[argName] = vals;
        } else {
          primaryArgs[argName] = vals;
          acceptableValues[argName] = [vals];
        }
      }

      const expected: ExpectedToolCall & { _acceptable?: Record<string, unknown[]> } = {
        name: funcName,
        arguments: primaryArgs,
      };
      // Attach acceptable values for the scorer
      (expected as Record<string, unknown>)._acceptable = acceptableValues;
      calls.push(expected);
    }
  }

  return calls;
}
