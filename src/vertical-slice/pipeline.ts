import type { Processor, Risk } from "../pipeline/processor.js";

export interface ConfiguredProcessor {
  readonly name: string;
  readonly processor: Processor;
  readonly onError: "continue" | "block";
  readonly timeoutMs: number;
}

export interface ProcessorTrace {
  readonly processor: string;
  readonly result: "pass" | "transform" | "block" | "error" | "timeout";
  readonly durationMs: number;
  readonly code?: string;
}

export type PipelineOutcome =
  | { readonly kind: "ready"; readonly original: string; readonly candidate: string; readonly risk: Risk; readonly traces: readonly ProcessorTrace[] }
  | { readonly kind: "review"; readonly original: string; readonly candidate: string; readonly risk: Risk; readonly reasons: readonly string[]; readonly traces: readonly ProcessorTrace[] }
  | { readonly kind: "blocked"; readonly original: string; readonly reason: string; readonly traces: readonly ProcessorTrace[] }
  | { readonly kind: "failed"; readonly original: string; readonly reason: string; readonly traces: readonly ProcessorTrace[] };

function combineRisk(left: Risk, right: Risk): Risk {
  if (left === "high" || right === "high") return "high";
  if (left === "unknown" || right === "unknown") return "unknown";
  return "low";
}

async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("processor timed out")), timeoutMs);
  try {
    return await work(AbortSignal.any([controller.signal, parentSignal]));
  } finally {
    clearTimeout(timer);
  }
}

export class PromptPipeline {
  readonly #processors: readonly ConfiguredProcessor[];
  readonly #timeoutMs: number;

  constructor(processors: readonly ConfiguredProcessor[], timeoutMs: number) {
    this.#processors = processors;
    this.#timeoutMs = timeoutMs;
  }

  async run(original: string): Promise<PipelineOutcome> {
    const pipelineController = new AbortController();
    const pipelineTimer = setTimeout(
      () => pipelineController.abort(new Error("pipeline timed out")),
      this.#timeoutMs,
    );
    try {
      return await this.#run(original, pipelineController.signal);
    } finally {
      clearTimeout(pipelineTimer);
    }
  }

  async #run(original: string, pipelineSignal: AbortSignal): Promise<PipelineOutcome> {
    let candidate = original;
    let risk: Risk = "low";
    const reasons: string[] = [];
    const traces: ProcessorTrace[] = [];

    for (const configured of this.#processors) {
      if (pipelineSignal.aborted) {
        return { kind: "failed", original, reason: "pipeline timed out", traces };
      }
      const startedAt = performance.now();
      let result;
      try {
        result = await withTimeout(
          (signal) => configured.processor.process(original, candidate, { host: "codex" }, signal),
          configured.timeoutMs,
          pipelineSignal,
        );
      } catch (error) {
        const timeout = pipelineSignal.aborted
          || (error instanceof Error && /abort|timed out/i.test(error.message));
        traces.push({
          processor: configured.name,
          result: timeout ? "timeout" : "error",
          durationMs: performance.now() - startedAt,
          code: timeout ? "processor-timeout" : "processor-threw",
        });
        if (configured.onError === "block") {
          return { kind: "failed", original, reason: pipelineSignal.aborted ? "pipeline timed out" : timeout ? "processor timed out" : "processor failed", traces };
        }
        continue;
      }

      traces.push({
        processor: configured.name,
        result: result.kind,
        durationMs: performance.now() - startedAt,
        ...(result.kind === "error" ? { code: result.code } : {}),
      });
      if (result.kind === "pass") continue;
      if (result.kind === "block") return { kind: "blocked", original, reason: result.reason, traces };
      if (result.kind === "error") {
        if (pipelineSignal.aborted) return { kind: "failed", original, reason: "pipeline timed out", traces };
        if (configured.onError === "block") return { kind: "failed", original, reason: result.message, traces };
        continue;
      }
      candidate = result.candidate;
      risk = combineRisk(risk, result.risk);
      reasons.push(...result.reasons);
    }

    if (candidate === original) return { kind: "ready", original, candidate, risk, traces };
    return { kind: "review", original, candidate, risk, reasons, traces };
  }
}
