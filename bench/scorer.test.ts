import { describe, it, expect } from "vitest";
import { scoreToolCalls, isPass, aggregateResults } from "./scorer.js";
import type { CaseResult } from "./types.js";

describe("scoreToolCalls", () => {
  it("scores a perfect match", () => {
    const score = scoreToolCalls(
      [{ name: "search", arguments: { query: "hello" } }],
      [{ name: "search", arguments: { query: "hello" } }],
    );
    expect(score.nameMatch).toBe(true);
    expect(score.countMatch).toBe(true);
    expect(score.argAccuracy).toBe(1);
    expect(isPass(score)).toBe(true);
  });

  it("detects wrong tool name", () => {
    const score = scoreToolCalls(
      [{ name: "browse", arguments: { query: "hello" } }],
      [{ name: "search", arguments: { query: "hello" } }],
    );
    expect(score.nameMatch).toBe(false);
    expect(isPass(score)).toBe(false);
  });

  it("detects wrong argument value", () => {
    const score = scoreToolCalls(
      [{ name: "search", arguments: { query: "goodbye" } }],
      [{ name: "search", arguments: { query: "hello" } }],
    );
    expect(score.nameMatch).toBe(true);
    expect(score.argAccuracy).toBe(0);
    expect(isPass(score)).toBe(false);
  });

  it("handles wildcard (undefined) expected args", () => {
    const score = scoreToolCalls(
      [{ name: "search", arguments: { query: "anything" } }],
      [{ name: "search", arguments: { query: undefined } }],
    );
    expect(score.nameMatch).toBe(true);
    expect(score.argAccuracy).toBe(1);
    expect(isPass(score)).toBe(true);
  });

  it("detects missing tool calls", () => {
    const score = scoreToolCalls(
      [],
      [{ name: "search", arguments: { query: "hello" } }],
    );
    expect(score.countMatch).toBe(false);
    expect(isPass(score)).toBe(false);
  });

  it("detects extra tool calls", () => {
    const score = scoreToolCalls(
      [
        { name: "search", arguments: { query: "a" } },
        { name: "search", arguments: { query: "b" } },
      ],
      [{ name: "search", arguments: { query: "a" } }],
    );
    expect(score.countMatch).toBe(false);
  });

  it("scores correctly when no tool calls expected and none made", () => {
    const score = scoreToolCalls([], []);
    expect(isPass(score)).toBe(true);
  });

  it("handles partial argument matches", () => {
    const score = scoreToolCalls(
      [
        {
          name: "create_contact",
          arguments: { name: "Jane", email: "wrong@example.com", phone: "555" },
        },
      ],
      [
        {
          name: "create_contact",
          arguments: { name: "Jane", email: "jane@example.com", phone: "555" },
        },
      ],
    );
    expect(score.nameMatch).toBe(true);
    // 2 out of 3 args match
    expect(score.argAccuracy).toBeCloseTo(2 / 3, 2);
  });
});

describe("aggregateResults", () => {
  it("groups by model and mode", () => {
    const results: CaseResult[] = [
      makeResult({ model: "claude", mode: "json-native", pass: true }),
      makeResult({ model: "claude", mode: "json-native", pass: false }),
      makeResult({ model: "claude", mode: "xml-text", pass: true }),
      makeResult({ model: "claude", mode: "xml-text", pass: true }),
    ];

    const agg = aggregateResults(results);
    expect(agg).toHaveLength(2);

    const jsonAgg = agg.find((a) => a.mode === "json-native")!;
    expect(jsonAgg.accuracy).toBe(0.5);

    const xmlAgg = agg.find((a) => a.mode === "xml-text")!;
    expect(xmlAgg.accuracy).toBe(1);
  });
});

function makeResult(overrides: Partial<CaseResult>): CaseResult {
  return {
    caseId: "test",
    mode: "json-native",
    model: "test-model",
    pass: false,
    score: { nameMatch: true, countMatch: true, argAccuracy: 1 },
    actual: [],
    expected: [],
    ...overrides,
  };
}
