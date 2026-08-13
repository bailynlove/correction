import type { GenerationMetrics } from "../models/structured-model.js";

export type Risk = "low" | "high" | "unknown";

export interface ProcessingContext {
  readonly host: string;
}

export type ProcessorResult =
  | { readonly kind: "pass"; readonly metrics?: GenerationMetrics }
  | {
      readonly kind: "transform";
      readonly candidate: string;
      readonly risk: Risk;
      readonly reasons: readonly string[];
      readonly metrics: GenerationMetrics;
    }
  | { readonly kind: "block"; readonly reason: string }
  | {
      readonly kind: "error";
      readonly code: string;
      readonly message: string;
      readonly debugCandidate?: string;
    };

export interface Processor {
  process(
    original: string,
    candidate: string,
    context: ProcessingContext,
    signal: AbortSignal,
  ): Promise<ProcessorResult>;
}
