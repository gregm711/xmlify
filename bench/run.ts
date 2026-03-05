#!/usr/bin/env tsx
/**
 * xmlify benchmark runner CLI.
 *
 * Usage:
 *   # Dry run with sample suite (no API calls)
 *   npm run bench:dry
 *
 *   # Run sample suite against Anthropic
 *   ANTHROPIC_API_KEY=sk-... npm run bench -- --model anthropic:claude-sonnet-4-6
 *
 *   # Run against multiple models
 *   npm run bench -- --model anthropic:claude-sonnet-4-6 --model openai:gpt-4o-mini
 *
 *   # Run all 3 modes (json-native, xml-text, xml-dual)
 *   npm run bench -- --model anthropic:claude-sonnet-4-6 --modes all
 *
 *   # Load a custom suite from JSON
 *   npm run bench -- --suite path/to/suite.json --model anthropic:claude-sonnet-4-6
 *
 *   # Load a BFCL JSONL file
 *   npm run bench -- --suite bfcl:path/to/data.jsonl --model openai:gpt-4o-mini
 *
 *   # Limit to first 10 cases, verbose output, save results
 *   npm run bench -- --model anthropic:claude-sonnet-4-6 --limit 10 --verbose --out bench/results
 *
 *   # Filter by category
 *   npm run bench -- --model anthropic:claude-sonnet-4-6 --category nested --category enum
 */

import { runBenchmark } from "./runner.js";
import { reportResults } from "./reporter.js";
import { sampleSuite } from "./suites/sample.js";
import { loadSuiteFromFile, loadBFCLFile } from "./suites/loader.js";
import type { ModelAdapter, RunMode, BenchmarkSuite, RunConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

function getValues(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` && i + 1 < args.length) {
      values.push(args[++i]);
    }
  }
  return values;
}

function getValue(name: string): string | undefined {
  return getValues(name)[0];
}

const dryRun = getFlag("dry-run");
const verbose = getFlag("verbose");
const modelSpecs = getValues("model");
const suiteSpec = getValue("suite");
const modesSpec = getValue("modes");
const categories = getValues("category");
const limit = getValue("limit") ? Number(getValue("limit")) : undefined;
const concurrency = getValue("concurrency") ? Number(getValue("concurrency")) : 5;
const outDir = getValue("out");

// ---------------------------------------------------------------------------
// Load suite
// ---------------------------------------------------------------------------

let suite: BenchmarkSuite;

if (!suiteSpec) {
  suite = sampleSuite;
  console.log("Using built-in sample suite (pass --suite to use a custom one)");
} else if (suiteSpec.startsWith("bfcl:")) {
  suite = loadBFCLFile(suiteSpec.slice(5));
} else {
  suite = loadSuiteFromFile(suiteSpec);
}

console.log(`Suite: ${suite.name} (${suite.cases.length} cases)`);

// ---------------------------------------------------------------------------
// Load models
// ---------------------------------------------------------------------------

async function loadModel(spec: string): Promise<ModelAdapter> {
  const [provider, ...rest] = spec.split(":");
  const modelId = rest.join(":") || undefined;

  switch (provider) {
    case "anthropic": {
      const { createAnthropicAdapter } = await import("./adapters/anthropic.js");
      return createAnthropicAdapter(modelId);
    }
    case "openai": {
      const { createOpenAIAdapter } = await import("./adapters/openai.js");
      return createOpenAIAdapter(modelId);
    }
    case "google": {
      const { createGoogleAdapter } = await import("./adapters/google.js");
      return createGoogleAdapter(modelId);
    }
    default:
      throw new Error(
        `Unknown provider "${provider}". Use anthropic:model, openai:model, or google:model`,
      );
  }
}

let models: ModelAdapter[];

if (dryRun && modelSpecs.length === 0) {
  // For dry run, provide a fake model
  models = [
    {
      name: "dry-run-model",
      callText: async () => ({ text: "" }),
      callWithTools: async () => ({ text: "", toolCalls: [] }),
    },
  ];
} else if (modelSpecs.length === 0) {
  console.error(
    "\nNo models specified. Use --model provider:model-id\n" +
      "Examples:\n" +
      "  --model anthropic:claude-sonnet-4-6\n" +
      "  --model openai:gpt-4o-mini\n" +
      "  --model google:gemini-2.5-flash\n",
  );
  process.exit(1);
} else {
  models = await Promise.all(modelSpecs.map(loadModel));
}

// ---------------------------------------------------------------------------
// Resolve modes
// ---------------------------------------------------------------------------

let modes: RunMode[];

if (modesSpec === "all") {
  modes = ["json-native", "xml-text", "xml-dual"];
} else if (modesSpec) {
  modes = modesSpec.split(",") as RunMode[];
} else {
  // Default: json-native + xml-text for a clean A/B comparison
  modes = ["json-native", "xml-text"];
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const config: RunConfig = {
  modes,
  concurrency,
  categories: categories.length > 0 ? categories : undefined,
  limit,
  verbose,
  dryRun,
};

const results = await runBenchmark(suite, models, config);
reportResults(results, { outDir, verbose });
