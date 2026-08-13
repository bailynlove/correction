import type { z } from "zod";

export interface GenerationOptions {
  readonly contextTokens: number;
  readonly maxOutputTokens: number;
  readonly keepAlive: string;
  readonly temperature: number;
  readonly think: boolean;
}

export interface GenerationMetrics {
  readonly wallDurationNs: number;
  readonly totalDurationNs: number;
  readonly loadDurationNs: number;
  readonly promptEvalDurationNs: number;
  readonly evalDurationNs: number;
  readonly promptEvalCount: number;
  readonly evalCount: number;
}

export interface StructuredGeneration<T> {
  readonly model: string;
  readonly system: string;
  readonly input: string;
  readonly schema: z.ZodType<T>;
  readonly options: GenerationOptions;
}

export interface StructuredGenerationResult<T> {
  readonly value: T;
  readonly metrics: GenerationMetrics;
}

export interface StructuredModel {
  generate<T>(
    request: StructuredGeneration<T>,
    signal: AbortSignal,
  ): Promise<StructuredGenerationResult<T>>;
}
