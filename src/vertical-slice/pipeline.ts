import type { ProcessingContext, Processor, Risk } from "../pipeline/processor.js";

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

export interface PipelineNotice {
  readonly code: "processor-timeout" | "processor-error";
  readonly processor: string;
  readonly message: string;
}

export type PipelineOutcome =
  | { readonly kind: "ready"; readonly original: string; readonly candidate: string; readonly risk: Risk; readonly notices: readonly PipelineNotice[]; readonly traces: readonly ProcessorTrace[] }
  | { readonly kind: "review"; readonly original: string; readonly candidate: string; readonly risk: Risk; readonly reasons: readonly string[]; readonly notices: readonly PipelineNotice[]; readonly traces: readonly ProcessorTrace[] }
  | { readonly kind: "blocked"; readonly original: string; readonly reason: string; readonly traces: readonly ProcessorTrace[] }
  | { readonly kind: "failed"; readonly original: string; readonly reason: string; readonly traces: readonly ProcessorTrace[] };

function combineRisk(left: Risk, right: Risk): Risk {
  if (left === "high" || right === "high") return "high";
  if (left === "unknown" || right === "unknown") return "unknown";
  return "low";
}

class DeadlineExceededError extends Error {
  readonly scope: "processor" | "pipeline";

  constructor(scope: "processor" | "pipeline") {
    super(`${scope} timed out`);
    this.name = "DeadlineExceededError";
    this.scope = scope;
  }
}

async function withDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const processorError = new DeadlineExceededError("processor");
  let timer: NodeJS.Timeout | undefined;
  let onParentAbort: (() => void) | undefined;
  const processorDeadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(processorError);
      controller.abort(processorError);
    }, timeoutMs);
  });
  const pipelineDeadline = new Promise<never>((_resolve, reject) => {
    onParentAbort = () => reject(new DeadlineExceededError("pipeline"));
    if (parentSignal.aborted) onParentAbort();
    else parentSignal.addEventListener("abort", onParentAbort, { once: true });
  });
  try {
    return await Promise.race([
      work(AbortSignal.any([controller.signal, parentSignal])),
      processorDeadline,
      pipelineDeadline,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onParentAbort !== undefined) parentSignal.removeEventListener("abort", onParentAbort);
  }
}

export class PromptPipeline {
  readonly #processors: readonly ConfiguredProcessor[];
  readonly #timeoutMs: number;

  constructor(processors: readonly ConfiguredProcessor[], timeoutMs: number) {
    this.#processors = processors;
    this.#timeoutMs = timeoutMs;
  }

  async run(original: string, context: ProcessingContext): Promise<PipelineOutcome> {
    const pipelineController = new AbortController();
    const pipelineTimer = setTimeout(
      () => pipelineController.abort(new Error("pipeline timed out")),
      this.#timeoutMs,
    );
    try {
      return await this.#run(original, context, pipelineController.signal);
    } finally {
      clearTimeout(pipelineTimer);
    }
  }

  async #run(
    original: string,
    context: ProcessingContext,
    pipelineSignal: AbortSignal,
  ): Promise<PipelineOutcome> {
    let candidate = original;
    let risk: Risk = "low";
    const reasons: string[] = [];
    const notices: PipelineNotice[] = [];
    const traces: ProcessorTrace[] = [];

    for (const configured of this.#processors) {
      if (pipelineSignal.aborted) {
        return { kind: "failed", original, reason: "pipeline timed out", traces };
      }
      const startedAt = performance.now();
      let result;
      try {
        result = await withDeadline(
          (signal) => configured.processor.process(original, candidate, context, signal),
          configured.timeoutMs,
          pipelineSignal,
        );
      } catch (error) {
        const deadline = error instanceof DeadlineExceededError ? error.scope : undefined;
        if (deadline === "pipeline" || pipelineSignal.aborted) {
          traces.push({
            processor: configured.name,
            result: "timeout",
            durationMs: performance.now() - startedAt,
            code: "pipeline-timeout",
          });
          return { kind: "failed", original, reason: "pipeline timed out", traces };
        }
        const timeout = deadline === "processor";
        traces.push({
          processor: configured.name,
          result: timeout ? "timeout" : "error",
          durationMs: performance.now() - startedAt,
          code: timeout ? "processor-timeout" : "processor-threw",
        });
        if (configured.onError === "block") {
          return { kind: "failed", original, reason: timeout ? `${configured.name} timed out` : `${configured.name} failed`, traces };
        }
        notices.push({
          code: timeout ? "processor-timeout" : "processor-error",
          processor: configured.name,
          message: timeout
            ? `${configured.name} timed out; the current prompt was preserved.`
            : `${configured.name} failed; the current prompt was preserved.`,
        });
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
        notices.push({
          code: "processor-error",
          processor: configured.name,
          message: `${configured.name} failed; the current prompt was preserved.`,
        });
        continue;
      }
      candidate = result.candidate;
      risk = combineRisk(risk, result.risk);
      reasons.push(...result.reasons);
    }

    if (candidate === original) return { kind: "ready", original, candidate, risk, notices, traces };
    return { kind: "review", original, candidate, risk, reasons, notices, traces };
  }
}
