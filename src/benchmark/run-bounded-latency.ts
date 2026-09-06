import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { join } from "node:path";

import { curatedCorpus, type CorpusCase } from "./corpus.js";
import { MlxModel } from "../models/mlx-model.js";
import { OllamaModel } from "../models/ollama-model.js";
import type { StructuredModel } from "../models/structured-model.js";
import { EnglishCorrection } from "../processors/english-correction/english-correction.js";
import { PromptPipeline, type PipelineOutcome } from "../vertical-slice/pipeline.js";

const SEED = 0xc011ec7;
const LENGTH_BANDS = ["000-249", "250-499", "500-649", "650+"] as const;

interface Options {
  readonly runtime: "mlx" | "ollama";
  readonly endpoint: string;
  readonly model: string;
  readonly split: "development" | "holdout";
  readonly runs: number;
  readonly processorTimeoutMs: number;
  readonly pipelineTimeoutMs: number;
  readonly outputDirectory: string;
}

interface ScheduledCase {
  readonly testCase: CorpusCase;
  readonly run: number;
}

interface RecordEntry {
  readonly caseId: string;
  readonly category: CorpusCase["category"];
  readonly run: number;
  readonly characters: number;
  readonly lengthBand: string;
  readonly outcome: PipelineOutcome["kind"];
  readonly processorResult: string;
  readonly wallDurationMs: number;
  readonly processorCompleted: boolean;
  readonly transformed: boolean;
  readonly timedOut: boolean;
  readonly originalPreserved: boolean;
  readonly exactReferenceMatch: boolean;
}

function positiveInteger(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseArguments(args: readonly string[]): Options {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key === undefined || !key.startsWith("--") || value === undefined) {
      throw new Error("arguments must use --name value pairs");
    }
    values.set(key.slice(2), value);
  }
  const runtime = values.get("runtime") ?? "mlx";
  if (runtime !== "mlx" && runtime !== "ollama") throw new Error("--runtime must be mlx or ollama");
  const split = values.get("split") ?? "holdout";
  if (split !== "development" && split !== "holdout") throw new Error("--split must be development or holdout");
  const processorTimeoutMs = positiveInteger(values.get("processor-timeout-ms") ?? "1800", "--processor-timeout-ms");
  const pipelineTimeoutMs = positiveInteger(values.get("pipeline-timeout-ms") ?? "2000", "--pipeline-timeout-ms");
  if (processorTimeoutMs >= pipelineTimeoutMs) throw new Error("processor timeout must be below pipeline timeout");
  return {
    runtime,
    endpoint: values.get("endpoint") ?? (runtime === "mlx" ? "http://127.0.0.1:18080" : "http://127.0.0.1:11434"),
    model: values.get("model") ?? "mlx-community/Qwen3.5-9B-MLX-4bit",
    split,
    runs: positiveInteger(values.get("runs") ?? "5", "--runs"),
    processorTimeoutMs,
    pipelineTimeoutMs,
    outputDirectory: values.get("out") ?? "benchmark/results/bounded-fail-open",
  };
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const output = [...items];
  let state = seed >>> 0;
  const random = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [output[index], output[target]] = [output[target] as T, output[index] as T];
  }
  return output;
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(fraction * ordered.length) - 1] ?? null;
}

function lengthBand(characters: number): string {
  if (characters < 250) return "000-249";
  if (characters < 500) return "250-499";
  if (characters < 650) return "500-649";
  return "650+";
}

function coverage(records: readonly RecordEntry[]): Record<string, unknown> {
  const requests = records.length;
  const completed = records.filter((record) => record.processorCompleted).length;
  const transformed = records.filter((record) => record.transformed).length;
  const timeouts = records.filter((record) => record.timedOut).length;
  return {
    requests,
    completed,
    completedRate: requests === 0 ? null : completed / requests,
    transformed,
    transformedRate: requests === 0 ? null : transformed / requests,
    timeouts,
    timeoutRate: requests === 0 ? null : timeouts / requests,
    p95OutcomeDurationMs: percentile(records.map((record) => record.wallDurationMs), 0.95),
  };
}

function modelFor(options: Options): StructuredModel {
  return options.runtime === "mlx" ? new MlxModel(options.endpoint) : new OllamaModel(options.endpoint);
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  await mkdir(options.outputDirectory, { recursive: true });
  const processor = new EnglishCorrection(modelFor(options), {
    model: options.model,
    contextTokens: 4096,
    maxOutputTokens: 256,
    keepAlive: "30m",
    temperature: 0,
    debugContent: false,
  });
  const pipeline = new PromptPipeline([{
    name: "british-english",
    processor,
    onError: "continue",
    timeoutMs: options.processorTimeoutMs,
  }], options.pipelineTimeoutMs);

  await pipeline.run("this sentence need correction", { host: "benchmark" });
  const cases = curatedCorpus().filter((testCase) => testCase.split === options.split);
  const schedule = shuffled(
    cases.flatMap((testCase) => Array.from({ length: options.runs }, (_, run) => ({ testCase, run: run + 1 }))),
    SEED,
  );
  const records: RecordEntry[] = [];
  for (const [index, scheduled] of schedule.entries()) {
    const startedAt = performance.now();
    const outcome = await pipeline.run(scheduled.testCase.input, { host: "benchmark" });
    const wallDurationMs = performance.now() - startedAt;
    const trace = outcome.traces[0];
    const candidate = outcome.kind === "ready" || outcome.kind === "review"
      ? outcome.candidate
      : scheduled.testCase.input;
    const timedOut = trace?.result === "timeout";
    records.push({
      caseId: scheduled.testCase.id,
      category: scheduled.testCase.category,
      run: scheduled.run,
      characters: scheduled.testCase.input.length,
      lengthBand: lengthBand(scheduled.testCase.input.length),
      outcome: outcome.kind,
      processorResult: trace?.result ?? "none",
      wallDurationMs,
      processorCompleted: trace?.result === "pass" || trace?.result === "transform",
      transformed: trace?.result === "transform",
      timedOut,
      originalPreserved: !timedOut || candidate === scheduled.testCase.input,
      exactReferenceMatch: scheduled.testCase.acceptableCorrections.includes(candidate),
    });
    if ((index + 1) % 25 === 0) process.stdout.write(`Completed ${index + 1}/${schedule.length}\n`);
  }

  const byLengthBand = Object.fromEntries(
    LENGTH_BANDS.map((band) => [band, coverage(records.filter((record) => record.lengthBand === band))]),
  );
  const summary = {
    generatedAt: new Date().toISOString(),
    model: options.model,
    runtime: options.runtime,
    split: options.split,
    runs: options.runs,
    processorTimeoutMs: options.processorTimeoutMs,
    pipelineTimeoutMs: options.pipelineTimeoutMs,
    ...coverage(records),
    byLengthBand,
    lateCandidateViolations: records.filter((record) => !record.originalPreserved).length,
    failedOutcomes: records.filter((record) => record.outcome === "failed" || record.outcome === "blocked").length,
    passesOutcomeLatencyGate: (percentile(records.map((record) => record.wallDurationMs), 0.95) ?? Infinity) <= options.pipelineTimeoutMs,
  };
  await writeFile(join(options.outputDirectory, "records.jsonl"), `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await writeFile(join(options.outputDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

await main();
