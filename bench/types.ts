import type { ToolDefinition } from "../src/types.js";

// ---------------------------------------------------------------------------
// Model adapter — plug in any LLM
// ---------------------------------------------------------------------------

/** A single message in a conversation. */
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** For tool result messages */
  toolCallId?: string;
  toolName?: string;
}

/** What the model returned. */
export interface ModelResponse {
  /** Raw text output from the model */
  text: string;
  /** Structured tool calls if the provider parsed them natively */
  toolCalls?: { name: string; arguments: Record<string, unknown> }[];
  /** Usage stats for cost tracking */
  usage?: { inputTokens: number; outputTokens: number };
  /** Raw latency in ms */
  latencyMs?: number;
}

/**
 * Adapt any LLM provider to the benchmark harness.
 *
 * Two modes:
 * - `nativeToolCalling`: pass tool schemas to the provider's API and get
 *   structured tool_use / function_call responses back.
 * - `textCompletion`: no native tool calling — tools are described in the
 *   system prompt, model responds with free-form text (we parse XML).
 */
export interface ModelAdapter {
  /** Human-readable name, e.g. "claude-sonnet-4-6" */
  name: string;

  /**
   * Call the model with native tool calling support.
   * Pass tool schemas to the API, get structured tool calls back.
   * Return null if this adapter doesn't support native tool calling.
   */
  callWithTools?(
    messages: Message[],
    tools: ToolDefinition[],
  ): Promise<ModelResponse>;

  /**
   * Call the model with a plain text prompt (no native tool schemas).
   * Used for XML-mode: tool schemas are in the system prompt,
   * model responds with <tool_call> blocks in text.
   */
  callText(messages: Message[]): Promise<ModelResponse>;
}

// ---------------------------------------------------------------------------
// Benchmark suite — define any benchmark
// ---------------------------------------------------------------------------

/** A single test case in a benchmark. */
export interface TestCase {
  /** Unique ID for this test case */
  id: string;
  /** Human-readable description */
  description?: string;
  /** Category/tag for grouping results (e.g. "simple", "parallel", "nested") */
  category?: string;
  /** The tools available for this test case */
  tools: ToolDefinition[];
  /** The user prompt / conversation that should trigger tool calls */
  prompt: string;
  /** Expected tool calls — the ground truth */
  expected: ExpectedToolCall[];
}

export interface ExpectedToolCall {
  name: string;
  /** Expected arguments. Use `undefined` for "any value is ok" on a field. */
  arguments: Record<string, unknown>;
}

/** A loaded benchmark suite. */
export interface BenchmarkSuite {
  /** Name of the benchmark (e.g. "BFCL-v4", "custom-tool-calling") */
  name: string;
  /** Optional description */
  description?: string;
  /** The test cases */
  cases: TestCase[];
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** How a test case was run */
export type RunMode = "json-native" | "xml-text" | "xml-dual";

/** Result of a single test case execution. */
export interface CaseResult {
  caseId: string;
  category?: string;
  mode: RunMode;
  model: string;

  /** Did the model produce the correct tool calls? */
  pass: boolean;

  /** Detailed scoring */
  score: {
    /** Correct tool name(s) selected */
    nameMatch: boolean;
    /** Correct number of tool calls */
    countMatch: boolean;
    /** Per-call argument accuracy (0-1) */
    argAccuracy: number;
  };

  /** What the model actually produced */
  actual: { name: string; arguments: Record<string, unknown> }[];
  /** What we expected */
  expected: ExpectedToolCall[];

  /** Cost / perf data */
  usage?: { inputTokens: number; outputTokens: number };
  latencyMs?: number;

  /** Any error that occurred */
  error?: string;
}

/** Aggregated results for a (model, mode) combination. */
export interface AggregateResult {
  model: string;
  mode: RunMode;
  total: number;
  passed: number;
  accuracy: number;
  avgArgAccuracy: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Breakdown by category */
  byCategory: Record<
    string,
    {
      total: number;
      passed: number;
      accuracy: number;
      avgArgAccuracy: number;
    }
  >;
}

// ---------------------------------------------------------------------------
// Runner config
// ---------------------------------------------------------------------------

export interface RunConfig {
  /** Which modes to run */
  modes: RunMode[];
  /** Max concurrent requests per model */
  concurrency?: number;
  /** Only run test cases matching these categories */
  categories?: string[];
  /** Only run first N test cases (for quick iteration) */
  limit?: number;
  /** Print each case result as it completes */
  verbose?: boolean;
  /** Don't actually call the model — just validate the setup */
  dryRun?: boolean;
}
