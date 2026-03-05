import type {
  BenchmarkSuite,
  CaseResult,
  ModelAdapter,
  RunConfig,
  RunMode,
  TestCase,
  Message,
} from "./types.js";
import { xmlify } from "../src/wrap.js";
import { scoreToolCalls, isPass } from "./scorer.js";

/**
 * Run a benchmark suite against one or more models in multiple modes.
 *
 * Modes:
 * - "json-native":  Use the provider's native tool calling (JSON schemas via API)
 * - "xml-text":     No native tools — inject XML schemas into system prompt,
 *                   model responds with <tool_call> XML, we parse it
 * - "xml-dual":     Native tool calling ON + XML schemas also in system prompt
 *                   (model sees both representations, responds via native format)
 */
export async function runBenchmark(
  suite: BenchmarkSuite,
  models: ModelAdapter[],
  config: RunConfig,
): Promise<CaseResult[]> {
  let cases = suite.cases;

  // Filter by category if specified
  if (config.categories?.length) {
    const cats = new Set(config.categories);
    cases = cases.filter((c) => c.category && cats.has(c.category));
  }

  // Limit for quick iteration
  if (config.limit && config.limit > 0) {
    cases = cases.slice(0, config.limit);
  }

  const totalRuns = cases.length * models.length * config.modes.length;
  console.log(
    `\nRunning ${suite.name}: ${cases.length} cases × ${models.length} models × ${config.modes.length} modes = ${totalRuns} runs\n`,
  );

  if (config.dryRun) {
    console.log("Dry run — validating setup only.\n");
    return dryRun(cases, models, config);
  }

  const allResults: CaseResult[] = [];
  const concurrency = config.concurrency ?? 5;

  for (const model of models) {
    for (const mode of config.modes) {
      console.log(`--- ${model.name} / ${mode} ---`);

      const results = await runWithConcurrency(
        cases,
        (tc) => runSingleCase(tc, model, mode),
        concurrency,
        config.verbose,
      );

      allResults.push(...results);

      const passed = results.filter((r) => r.pass).length;
      console.log(`    ${passed}/${results.length} passed\n`);
    }
  }

  return allResults;
}

// ---------------------------------------------------------------------------
// Single case execution
// ---------------------------------------------------------------------------

async function runSingleCase(
  tc: TestCase,
  model: ModelAdapter,
  mode: RunMode,
): Promise<CaseResult> {
  const start = Date.now();

  try {
    let actual: { name: string; arguments: Record<string, unknown> }[];
    let usage: CaseResult["usage"];

    if (mode === "json-native") {
      actual = await runJsonNative(tc, model);
    } else if (mode === "xml-text") {
      const result = await runXmlText(tc, model);
      actual = result.calls;
      usage = result.usage;
    } else if (mode === "xml-dual") {
      actual = await runXmlDual(tc, model);
    } else {
      throw new Error(`Unknown mode: ${mode}`);
    }

    const latencyMs = Date.now() - start;
    const score = scoreToolCalls(actual, tc.expected);

    return {
      caseId: tc.id,
      category: tc.category,
      mode,
      model: model.name,
      pass: isPass(score),
      score,
      actual,
      expected: tc.expected,
      usage,
      latencyMs,
    };
  } catch (err) {
    return {
      caseId: tc.id,
      category: tc.category,
      mode,
      model: model.name,
      pass: false,
      score: { nameMatch: false, countMatch: false, argAccuracy: 0 },
      actual: [],
      expected: tc.expected,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Mode implementations
// ---------------------------------------------------------------------------

/** JSON-native: pass tools to provider API, get structured tool calls back. */
async function runJsonNative(
  tc: TestCase,
  model: ModelAdapter,
): Promise<{ name: string; arguments: Record<string, unknown> }[]> {
  if (!model.callWithTools) {
    throw new Error(`Model ${model.name} does not support native tool calling`);
  }

  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are a helpful assistant. Use the available tools to respond to the user's request. " +
        "Always use tools when they are relevant — do not answer from memory if a tool can help.",
    },
    { role: "user", content: tc.prompt },
  ];

  const response = await model.callWithTools(messages, tc.tools);
  return response.toolCalls ?? [];
}

/**
 * XML-text: no native tools — inject XML schemas into system prompt,
 * model responds with <tool_call> XML blocks in plain text.
 */
async function runXmlText(
  tc: TestCase,
  model: ModelAdapter,
): Promise<{
  calls: { name: string; arguments: Record<string, unknown> }[];
  usage?: CaseResult["usage"];
}> {
  const session = xmlify(tc.tools);

  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are a helpful assistant.\n\n" +
        session.instructionBlock +
        "\n\nWhen you want to use a tool, respond ONLY with the <tool_call> XML block. " +
        "Do not include any other text before or after the tool call.",
    },
    { role: "user", content: tc.prompt },
  ];

  const response = await model.callText(messages);
  const calls = session.parseResponse(response.text);
  return {
    calls: calls.map((c) => ({
      name: c.name,
      arguments: c.arguments as Record<string, unknown>,
    })),
    usage: response.usage,
  };
}

/**
 * XML-dual: native tool calling ON + XML schemas also in system prompt.
 * Model gets both representations, responds via native format.
 */
async function runXmlDual(
  tc: TestCase,
  model: ModelAdapter,
): Promise<{ name: string; arguments: Record<string, unknown> }[]> {
  if (!model.callWithTools) {
    throw new Error(`Model ${model.name} does not support native tool calling`);
  }

  const session = xmlify(tc.tools);

  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are a helpful assistant. Use the available tools to respond to the user's request.\n\n" +
        "For reference, here are the tool schemas in XML format:\n\n" +
        session.toolSchemaXml,
    },
    { role: "user", content: tc.prompt },
  ];

  const response = await model.callWithTools(messages, tc.tools);
  return response.toolCalls ?? [];
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
  verbose?: boolean,
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;
  let completed = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      const result = await fn(items[i]);
      results[i] = result;
      completed++;

      if (verbose) {
        const r = result as unknown as CaseResult;
        const status = r.pass ? "PASS" : "FAIL";
        const err = r.error ? ` (${r.error})` : "";
        process.stdout.write(
          `  [${completed}/${items.length}] ${r.caseId}: ${status}${err}\n`,
        );
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Dry run — validates setup without calling models
// ---------------------------------------------------------------------------

function dryRun(
  cases: TestCase[],
  models: ModelAdapter[],
  config: RunConfig,
): CaseResult[] {
  const results: CaseResult[] = [];

  for (const tc of cases) {
    // Validate that xmlify can process the schemas
    const session = xmlify(tc.tools);
    const schemaXml = session.toolSchemaXml;

    console.log(`  Case "${tc.id}":`);
    console.log(`    Tools: ${tc.tools.map((t) => t.name).join(", ")}`);
    console.log(`    Expected calls: ${tc.expected.map((e) => e.name).join(", ")}`);
    console.log(`    XML schema length: ${schemaXml.length} chars`);
    console.log(`    Category: ${tc.category ?? "none"}`);

    for (const model of models) {
      for (const mode of config.modes) {
        if (mode !== "xml-text" && !model.callWithTools) {
          console.log(`    SKIP ${model.name}/${mode} — no native tool calling support`);
        }

        results.push({
          caseId: tc.id,
          category: tc.category,
          mode,
          model: model.name,
          pass: false,
          score: { nameMatch: false, countMatch: false, argAccuracy: 0 },
          actual: [],
          expected: tc.expected,
          error: "dry-run",
        });
      }
    }
  }

  return results;
}
