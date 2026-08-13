import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, hostname, platform, release, totalmem } from "node:os";
import { join } from "node:path";

import { curatedCorpus, generatedProtectedCorpus, type CorpusCase } from "./corpus.js";
import { MlxModel } from "../models/mlx-model.js";
import { OllamaModel } from "../models/ollama-model.js";
import type { StructuredModel } from "../models/structured-model.js";
import type { ProcessorResult } from "../pipeline/processor.js";
import { EnglishCorrection } from "../processors/english-correction/english-correction.js";
import { projectPrompt } from "../processors/english-correction/protected-spans.js";
import { TEMPLATE_VERSION } from "../processors/english-correction/template.js";
import { SparseEnglishCorrection } from "../prototypes/sparse-edit/sparse-english-correction.js";

const DEFAULT_MODELS = ["qwen3.5:2b", "qwen3:1.7b", "gemma3:1b", "granite3.3:2b"] as const;
const SEED = 0xc011ec7;

interface CliOptions {
  readonly runtime: "ollama" | "mlx";
  readonly endpoint: string;
  readonly models: readonly string[];
  readonly split: "development" | "holdout" | "all";
  readonly runs: number;
  readonly limit?: number;
  readonly caseIds?: readonly string[];
  readonly structuralLimit: number;
  readonly outputDirectory: string;
  readonly timeoutMs: number;
  readonly processor: "full" | "sparse";
}

interface ScheduledCase {
  readonly testCase: CorpusCase;
  readonly run: number;
}

interface RecordedResult {
  readonly model: string;
  readonly caseId: string;
  readonly category: CorpusCase["category"];
  readonly run: number;
  readonly input: string;
  readonly output: string;
  readonly resultKind: ProcessorResult["kind"];
  readonly error?: string;
  readonly wallDurationMs?: number;
  readonly exactReferenceMatch: boolean;
}

function parsePositiveInteger(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseArguments(arguments_: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (key === undefined || !key.startsWith("--") || value === undefined) {
      throw new Error(`expected --name value arguments; received ${key ?? "end of input"}`);
    }
    values.set(key.slice(2), value);
  }
  const split = values.get("split") ?? "development";
  if (split !== "development" && split !== "holdout" && split !== "all") {
    throw new Error("--split must be development, holdout, or all");
  }
  const runtime = values.get("runtime") ?? "ollama";
  if (runtime !== "ollama" && runtime !== "mlx") {
    throw new Error("--runtime must be ollama or mlx");
  }
  const processor = values.get("processor") ?? "full";
  if (processor !== "full" && processor !== "sparse") {
    throw new Error("--processor must be full or sparse");
  }
  const limitValue = values.get("limit");
  const caseIdsValue = values.get("case-ids");
  return {
    runtime,
    endpoint: values.get("endpoint") ?? (runtime === "mlx" ? "http://127.0.0.1:18080" : "http://127.0.0.1:11434"),
    models: (values.get("models")?.split(",") ?? DEFAULT_MODELS).filter(Boolean),
    split,
    runs: parsePositiveInteger(values.get("runs") ?? "5", "--runs"),
    ...(limitValue === undefined ? {} : { limit: parsePositiveInteger(limitValue, "--limit") }),
    ...(caseIdsValue === undefined ? {} : { caseIds: caseIdsValue.split(",").filter(Boolean) }),
    structuralLimit: parsePositiveInteger(values.get("structural-limit") ?? "1000", "--structural-limit"),
    outputDirectory: values.get("out") ?? "benchmark/results",
    timeoutMs: parsePositiveInteger(values.get("timeout-ms") ?? "2000", "--timeout-ms"),
    processor,
  };
}

function shuffled<T>(items: readonly T[], initialSeed: number): T[] {
  const result = [...items];
  let state = initialSeed >>> 0;
  const random = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target] as T, result[index] as T];
  }
  return result;
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(fraction * ordered.length) - 1] ?? null;
}

function outputFor(input: string, result: ProcessorResult): string {
  if (result.kind === "transform") return result.candidate;
  if (result.kind === "error" && result.debugCandidate !== undefined) return result.debugCandidate;
  return input;
}

function metricsFor(result: ProcessorResult): number | undefined {
  if ((result.kind === "pass" || result.kind === "transform") && result.metrics !== undefined) {
    return result.metrics.wallDurationNs / 1_000_000;
  }
  return undefined;
}

async function ollamaVersion(): Promise<string> {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/version");
    const body = await response.json() as { version?: unknown };
    return typeof body.version === "string" ? body.version : "unknown";
  } catch {
    return "unavailable";
  }
}

async function ollamaDigests(): Promise<Record<string, string>> {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags");
    const body = await response.json() as { models?: Array<{ name?: unknown; digest?: unknown }> };
    return Object.fromEntries((body.models ?? []).flatMap((model) =>
      typeof model.name === "string" && typeof model.digest === "string" ? [[model.name, model.digest]] : [],
    ));
  } catch {
    return {};
  }
}

async function unloadModel(model: string, endpoint: string): Promise<void> {
  await fetch(new URL("/api/generate", endpoint), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, keep_alive: 0 }),
  });
}

async function runModel(
  model: string,
  schedule: readonly ScheduledCase[],
  structuralInputs: readonly string[],
  options: CliOptions,
): Promise<{
  readonly records: readonly RecordedResult[];
  readonly structuralRecords: readonly RecordedResult[];
  readonly coldStartDurationMs: number | null;
  readonly coldStartError: string | null;
}> {
  const structuredModel: StructuredModel = options.runtime === "mlx"
    ? new MlxModel(options.endpoint)
    : new OllamaModel(options.endpoint);
  const ProcessorClass = options.processor === "sparse" ? SparseEnglishCorrection : EnglishCorrection;
  const processor = new ProcessorClass(structuredModel, {
    model,
    contextTokens: 4_096,
    maxOutputTokens: 256,
    keepAlive: "30m",
    temperature: 0,
    debugContent: true,
  });

  if (options.runtime === "ollama") await unloadModel(model, options.endpoint);
  const warmup = await processor.process(
    "this sentence need correction",
    "this sentence need correction",
    { host: "benchmark" },
    AbortSignal.timeout(120_000),
  );
  const coldStartError = warmup.kind === "error" ? `${warmup.code}: ${warmup.message}` : null;
  const coldStartDurationMs = metricsFor(warmup) ?? null;

  const records: RecordedResult[] = [];
  for (const { testCase, run } of schedule) {
    const result = await processor.process(
      testCase.input,
      testCase.input,
      { host: "benchmark" },
      AbortSignal.timeout(options.timeoutMs),
    );
    const output = outputFor(testCase.input, result);
    const wallDurationMs = metricsFor(result);
    records.push({
      model,
      caseId: testCase.id,
      category: testCase.category,
      run,
      input: testCase.input,
      output,
      resultKind: result.kind,
      ...(result.kind === "error" ? { error: `${result.code}: ${result.message}` } : {}),
      ...(wallDurationMs === undefined ? {} : { wallDurationMs }),
      exactReferenceMatch: testCase.acceptableCorrections.includes(output),
    });
  }

  const structuralRecords: RecordedResult[] = [];
  for (const [index, input] of shuffled(structuralInputs, SEED ^ 0x51a7).entries()) {
    const result = await processor.process(input, input, { host: "benchmark" }, AbortSignal.timeout(options.timeoutMs));
    const output = outputFor(input, result);
    const wallDurationMs = metricsFor(result);
    structuralRecords.push({
      model,
      caseId: `generated-protected-${(index + 1).toString().padStart(4, "0")}`,
      category: "protected",
      run: 1,
      input,
      output,
      resultKind: result.kind,
      ...(result.kind === "error" ? { error: `${result.code}: ${result.message}` } : {}),
      ...(wallDurationMs === undefined ? {} : { wallDurationMs }),
      exactReferenceMatch: false,
    });
  }
  return { records, structuralRecords, coldStartDurationMs, coldStartError };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  await mkdir(options.outputDirectory, { recursive: true });

  const generatedStructural = generatedProtectedCorpus();
  for (const input of generatedStructural) {
    const projection = projectPrompt(input);
    if (projection.restore(projection.projectedText) !== input) throw new Error("protected-span round trip failed");
  }

  const eligible = curatedCorpus()
    .filter((testCase) => options.split === "all" || testCase.split === options.split)
    .filter((testCase) => options.caseIds === undefined || options.caseIds.includes(testCase.id));
  if (options.caseIds !== undefined && eligible.length !== options.caseIds.length) {
    const found = new Set(eligible.map((testCase) => testCase.id));
    const missing = options.caseIds.filter((caseId) => !found.has(caseId));
    throw new Error(`unknown or unavailable --case-ids: ${missing.join(", ")}`);
  }
  const selected = options.limit === undefined ? eligible : shuffled(eligible, SEED ^ 0x5c4ee7).slice(0, options.limit);
  const schedule = shuffled(
    selected.flatMap((testCase) => Array.from({ length: options.runs }, (_, run) => ({ testCase, run: run + 1 }))),
    SEED,
  );
  const environment = {
    generatedAt: new Date().toISOString(),
    hostname: hostname(),
    platform: platform(),
    architecture: arch(),
    chip: cpus().at(0)?.model ?? "unknown",
    osRelease: release(),
    totalMemoryBytes: totalmem(),
    node: process.version,
    runtime: options.runtime,
    endpoint: options.endpoint,
    ollama: options.runtime === "ollama" ? await ollamaVersion() : null,
    modelDigests: options.runtime === "ollama" ? await ollamaDigests() : {},
    templateVersion: options.processor === "full" ? TEMPLATE_VERSION : "sparse-edit-v1",
    seed: SEED,
    generation: { contextTokens: 4_096, maxOutputTokens: 256, keepAlive: "30m", temperature: 0, think: false },
    protocol: { ...options, selectedCases: selected.length, structuralCases: 1_000 },
  };
  await writeFile(join(options.outputDirectory, "environment.json"), `${JSON.stringify(environment, null, 2)}\n`);

  for (const model of options.models) {
    process.stdout.write(`Benchmarking ${model}: ${schedule.length} requests\n`);
    const { records, structuralRecords, coldStartDurationMs, coldStartError } = await runModel(
      model,
      schedule,
      generatedStructural.slice(0, options.structuralLimit),
      options,
    );
    const durations = records.flatMap((record) => record.wallDurationMs === undefined ? [] : [record.wallDurationMs]);
    const summary = {
      model,
      coldStartDurationMs,
      coldStartError,
      requests: records.length,
      errors: records.filter((record) => record.resultKind === "error").length,
      unchangedViolations: records.filter((record) => record.category === "unchanged" && record.output !== record.input).length,
      structuralCases: structuralRecords.length,
      structuralErrors: structuralRecords.filter((record) => record.resultKind === "error").length,
      exactReferenceMatches: records.filter((record) => record.exactReferenceMatch).length,
      p50WallDurationMs: percentile(durations, 0.5),
      p95WallDurationMs: percentile(durations, 0.95),
      passesLatencyGate: records.every((record) => record.resultKind !== "error")
        && (percentile(durations, 0.95) ?? Number.POSITIVE_INFINITY) <= 2_000,
      passesAutomatedHardGates:
        coldStartError === null
        && records.every((record) => record.resultKind !== "error")
        && records.every((record) => record.category !== "unchanged" || record.output === record.input)
        && structuralRecords.every((record) => record.resultKind !== "error"),
    };
    const safeName = model.replaceAll(/[^a-zA-Z0-9.-]/g, "_");
    await writeFile(join(options.outputDirectory, `${safeName}.jsonl`), `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
    await writeFile(
      join(options.outputDirectory, `${safeName}.structural.jsonl`),
      `${structuralRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
    );
    await writeFile(join(options.outputDirectory, `${safeName}.summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  }
}

await main();
