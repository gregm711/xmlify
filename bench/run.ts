#!/usr/bin/env tsx
/**
 * xmlify benchmark runner CLI.
 *
 * Usage:
 *   # Dry run with sample suite (no API calls)
 *   npm run bench:dry
 *
 *   # Run BFCL simple category (first 10 cases) against Gemini Flash-Lite via OpenRouter
 *   OPENROUTER_API_KEY=... npm run bench -- \
 *     --suite bfcl:simple --limit 10 --verbose \
 *     --model openrouter:google/gemini-3.1-flash-lite-preview
 *
 *   # Run full BFCL simple + multiple categories
 *   npm run bench -- --suite bfcl:simple,multiple --model openrouter:google/gemini-3.1-flash-lite-preview
 *
 *   # Run against multiple models
 *   npm run bench -- --model anthropic:claude-sonnet-4-6 --model openai:gpt-4o-mini
 *
 *   # Run all 3 modes (json-native, xml-text, xml-dual)
 *   npm run bench -- --model openrouter:google/gemini-3.1-flash-lite-preview --modes all
 *
 *   # Load a custom suite from JSON file
 *   npm run bench -- --suite file:path/to/suite.json --model anthropic:claude-sonnet-4-6
 *
 *   # Limit to first N cases, verbose output, save results
 *   npm run bench -- --model openrouter:google/gemini-3.1-flash-lite-preview --limit 10 --verbose --out bench/results
 */

import { runBenchmark } from "./runner.js";
import { reportResults } from "./reporter.js";
import { sampleSuite } from "./suites/sample.js";
import { loadSuiteFromFile } from "./suites/loader.js";
import { loadBFCLCategories } from "./suites/bfcl.js";
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
  // bfcl:simple or bfcl:simple,multiple,parallel
  const cats = suiteSpec.slice(5).split(",");
  suite = loadBFCLCategories(cats);
} else if (suiteSpec.startsWith("file:")) {
  suite = loadSuiteFromFile(suiteSpec.slice(5));
} else {
  // Try as file path
  suite = loadSuiteFromFile(suiteSpec);
}

console.log(`Suite: ${suite.name} (${suite.cases.length} cases)`);

// ---------------------------------------------------------------------------
// Load models
// ---------------------------------------------------------------------------

async function loadModel(spec: string): Promise<ModelAdapter> {
  // Split on first colon only for providers like openrouter:google/model-name
  const colonIdx = spec.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(`Invalid model spec "${spec}". Use provider:model-id`);
  }
  const provider = spec.slice(0, colonIdx);
  const modelId = spec.slice(colonIdx + 1) || undefined;

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
    case "openrouter": {
      const { createOpenRouterAdapter } = await import("./adapters/openrouter.js");
      return createOpenRouterAdapter(modelId!);
    }
    default:
      throw new Error(
        `Unknown provider "${provider}". Use anthropic:, openai:, google:, or openrouter:`,
      );
  }
}

let models: ModelAdapter[];

if (dryRun && modelSpecs.length === 0) {
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
      "  --model openrouter:google/gemini-3.1-flash-lite-preview\n" +
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
