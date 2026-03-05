import type { AggregateResult, CaseResult } from "./types.js";
import { aggregateResults } from "./scorer.js";
import * as fs from "fs";
import * as path from "path";

/**
 * Print a summary table to stdout and optionally write detailed results to disk.
 */
export function reportResults(
  results: CaseResult[],
  options: { outDir?: string; verbose?: boolean } = {},
): void {
  const aggregates = aggregateResults(results);

  printSummaryTable(aggregates);
  printCategoryBreakdown(aggregates);
  printCostComparison(aggregates);

  if (options.verbose) {
    printFailures(results);
  }

  if (options.outDir) {
    writeResultsToDisk(results, aggregates, options.outDir);
  }
}

// ---------------------------------------------------------------------------
// Summary table
// ---------------------------------------------------------------------------

function printSummaryTable(aggregates: AggregateResult[]): void {
  console.log("\n" + "=".repeat(80));
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(80));

  const header = padRow([
    "Model",
    "Mode",
    "Pass",
    "Total",
    "Accuracy",
    "Arg Acc",
    "Avg Latency",
  ]);
  console.log(header);
  console.log("-".repeat(80));

  for (const a of aggregates) {
    console.log(
      padRow([
        a.model,
        a.mode,
        String(a.passed),
        String(a.total),
        pct(a.accuracy),
        pct(a.avgArgAccuracy),
        `${Math.round(a.avgLatencyMs)}ms`,
      ]),
    );
  }

  // Print delta if we have both json-native and xml-text for the same model
  const models = [...new Set(aggregates.map((a) => a.model))];
  for (const model of models) {
    const json = aggregates.find((a) => a.model === model && a.mode === "json-native");
    const xml = aggregates.find((a) => a.model === model && a.mode === "xml-text");
    const dual = aggregates.find((a) => a.model === model && a.mode === "xml-dual");

    if (json && xml) {
      const delta = xml.accuracy - json.accuracy;
      const sign = delta >= 0 ? "+" : "";
      console.log(
        `\n  ${model} XML vs JSON: ${sign}${pct(delta)} accuracy delta`,
      );
    }
    if (json && dual) {
      const delta = dual.accuracy - json.accuracy;
      const sign = delta >= 0 ? "+" : "";
      console.log(
        `  ${model} XML-Dual vs JSON: ${sign}${pct(delta)} accuracy delta`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Category breakdown
// ---------------------------------------------------------------------------

function printCategoryBreakdown(aggregates: AggregateResult[]): void {
  // Collect all categories across all aggregates
  const allCats = new Set<string>();
  for (const a of aggregates) {
    for (const cat of Object.keys(a.byCategory)) {
      allCats.add(cat);
    }
  }
  if (allCats.size <= 1) return;

  console.log("\n" + "=".repeat(80));
  console.log("BY CATEGORY");
  console.log("=".repeat(80));

  for (const cat of [...allCats].sort()) {
    console.log(`\n  ${cat}:`);
    for (const a of aggregates) {
      const c = a.byCategory[cat];
      if (!c) continue;
      console.log(
        `    ${a.model} / ${a.mode}: ${c.passed}/${c.total} (${pct(c.accuracy)}) arg_acc=${pct(c.avgArgAccuracy)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Cost comparison
// ---------------------------------------------------------------------------

function printCostComparison(aggregates: AggregateResult[]): void {
  const hasTokens = aggregates.some(
    (a) => a.totalInputTokens > 0 || a.totalOutputTokens > 0,
  );
  if (!hasTokens) return;

  console.log("\n" + "=".repeat(80));
  console.log("TOKEN USAGE");
  console.log("=".repeat(80));

  for (const a of aggregates) {
    console.log(
      `  ${a.model} / ${a.mode}: ${a.totalInputTokens.toLocaleString()} in / ${a.totalOutputTokens.toLocaleString()} out`,
    );
  }
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

function printFailures(results: CaseResult[]): void {
  const failures = results.filter((r) => !r.pass);
  if (failures.length === 0) return;

  console.log("\n" + "=".repeat(80));
  console.log(`FAILURES (${failures.length})`);
  console.log("=".repeat(80));

  for (const f of failures.slice(0, 20)) {
    console.log(`\n  ${f.caseId} [${f.model}/${f.mode}]`);
    if (f.error) {
      console.log(`    Error: ${f.error}`);
    }
    console.log(`    Expected: ${JSON.stringify(f.expected.map((e) => e.name))}`);
    console.log(`    Actual:   ${JSON.stringify(f.actual.map((a) => a.name))}`);
    console.log(
      `    Score: name=${f.score.nameMatch} count=${f.score.countMatch} args=${pct(f.score.argAccuracy)}`,
    );
  }

  if (failures.length > 20) {
    console.log(`\n  ... and ${failures.length - 20} more failures`);
  }
}

// ---------------------------------------------------------------------------
// Disk output
// ---------------------------------------------------------------------------

function writeResultsToDisk(
  results: CaseResult[],
  aggregates: AggregateResult[],
  outDir: string,
): void {
  fs.mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Full results as JSONL (one line per case for easy grep/jq)
  const jsonlPath = path.join(outDir, `results-${timestamp}.jsonl`);
  const jsonl = results.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.writeFileSync(jsonlPath, jsonl);

  // Summary as JSON
  const summaryPath = path.join(outDir, `summary-${timestamp}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(aggregates, null, 2) + "\n");

  console.log(`\nResults written to:`);
  console.log(`  ${jsonlPath}`);
  console.log(`  ${summaryPath}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function padRow(cells: string[]): string {
  const widths = [24, 14, 6, 6, 10, 10, 12];
  return cells.map((c, i) => c.padEnd(widths[i] ?? 12)).join("");
}
