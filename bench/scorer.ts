import type { CaseResult, ExpectedToolCall, AggregateResult } from "./types.js";

/**
 * Score actual tool calls against expected ones.
 * Returns { pass, nameMatch, countMatch, argAccuracy }.
 */
export function scoreToolCalls(
  actual: { name: string; arguments: Record<string, unknown> }[],
  expected: ExpectedToolCall[],
): CaseResult["score"] {
  const countMatch = actual.length === expected.length;

  if (expected.length === 0) {
    // No tool calls expected — pass if model also made none
    return {
      nameMatch: actual.length === 0,
      countMatch,
      argAccuracy: actual.length === 0 ? 1 : 0,
    };
  }

  // Match actual calls to expected calls greedily by name
  const matched = matchCalls(actual, expected);

  const nameMatch = matched.every(
    (m) => m.expected !== null && m.actual !== null,
  );

  // Calculate argument accuracy across matched pairs
  let totalArgScore = 0;
  let totalPairs = 0;

  for (const m of matched) {
    if (!m.actual || !m.expected) continue;
    totalPairs++;
    totalArgScore += scoreArguments(m.actual.arguments, m.expected.arguments);
  }

  const argAccuracy = totalPairs > 0 ? totalArgScore / totalPairs : 0;

  return {
    nameMatch,
    countMatch,
    argAccuracy,
  };
}

/** Check if a case result is a full pass. */
export function isPass(score: CaseResult["score"]): boolean {
  return score.nameMatch && score.countMatch && score.argAccuracy >= 0.99;
}

/**
 * Aggregate individual case results into summary stats.
 */
export function aggregateResults(results: CaseResult[]): AggregateResult[] {
  // Group by (model, mode)
  const groups = new Map<string, CaseResult[]>();
  for (const r of results) {
    const key = `${r.model}|${r.mode}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const aggregates: AggregateResult[] = [];

  for (const [key, cases] of groups) {
    const [model, mode] = key.split("|") as [string, CaseResult["mode"]];
    const passed = cases.filter((c) => c.pass).length;

    // By category
    const catGroups = new Map<string, CaseResult[]>();
    for (const c of cases) {
      const cat = c.category ?? "uncategorized";
      const list = catGroups.get(cat) ?? [];
      list.push(c);
      catGroups.set(cat, list);
    }

    const byCategory: AggregateResult["byCategory"] = {};
    for (const [cat, catCases] of catGroups) {
      const catPassed = catCases.filter((c) => c.pass).length;
      byCategory[cat] = {
        total: catCases.length,
        passed: catPassed,
        accuracy: catCases.length > 0 ? catPassed / catCases.length : 0,
        avgArgAccuracy: avg(catCases.map((c) => c.score.argAccuracy)),
      };
    }

    aggregates.push({
      model,
      mode,
      total: cases.length,
      passed,
      accuracy: cases.length > 0 ? passed / cases.length : 0,
      avgArgAccuracy: avg(cases.map((c) => c.score.argAccuracy)),
      avgLatencyMs: avg(cases.filter((c) => c.latencyMs).map((c) => c.latencyMs!)),
      totalInputTokens: sum(cases.map((c) => c.usage?.inputTokens ?? 0)),
      totalOutputTokens: sum(cases.map((c) => c.usage?.outputTokens ?? 0)),
      byCategory,
    });
  }

  return aggregates.sort((a, b) => {
    // Sort by model, then mode
    if (a.model !== b.model) return a.model.localeCompare(b.model);
    return a.mode.localeCompare(b.mode);
  });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface MatchPair {
  actual: { name: string; arguments: Record<string, unknown> } | null;
  expected: ExpectedToolCall | null;
}

/** Greedy match actual→expected by tool name. */
function matchCalls(
  actual: { name: string; arguments: Record<string, unknown> }[],
  expected: ExpectedToolCall[],
): MatchPair[] {
  const pairs: MatchPair[] = [];
  const usedExpected = new Set<number>();

  for (const act of actual) {
    let bestIdx = -1;
    let bestArgScore = -1;

    for (let i = 0; i < expected.length; i++) {
      if (usedExpected.has(i)) continue;
      if (expected[i].name !== act.name) continue;

      const argScore = scoreArguments(act.arguments, expected[i].arguments);
      if (argScore > bestArgScore) {
        bestArgScore = argScore;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      pairs.push({ actual: act, expected: expected[bestIdx] });
      usedExpected.add(bestIdx);
    } else {
      pairs.push({ actual: act, expected: null });
    }
  }

  // Add unmatched expected calls
  for (let i = 0; i < expected.length; i++) {
    if (!usedExpected.has(i)) {
      pairs.push({ actual: null, expected: expected[i] });
    }
  }

  return pairs;
}

/**
 * Score argument accuracy between actual and expected (0-1).
 * Skips expected fields with value `undefined` (wildcard).
 */
function scoreArguments(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
): number {
  const keys = Object.keys(expected).filter((k) => expected[k] !== undefined);
  if (keys.length === 0) return 1;

  let matches = 0;
  for (const key of keys) {
    if (deepEqual(actual[key], expected[key])) {
      matches++;
    }
  }

  return matches / keys.length;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key, i) => key === bKeys[i] && deepEqual(aObj[key], bObj[key]));
  }

  // Loose numeric comparison (model might return "5" vs 5)
  if (typeof a === "number" && typeof b === "string") return a === Number(b);
  if (typeof a === "string" && typeof b === "number") return Number(a) === b;

  return false;
}

function avg(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}
