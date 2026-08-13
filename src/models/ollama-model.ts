import { performance } from "node:perf_hooks";
import { z } from "zod";

import type {
  GenerationMetrics,
  StructuredGeneration,
  StructuredGenerationResult,
  StructuredModel,
} from "./structured-model.js";

const ollamaResponseSchema = z.object({
  message: z.object({ content: z.string() }),
  total_duration: z.number().int().nonnegative().optional(),
  load_duration: z.number().int().nonnegative().optional(),
  prompt_eval_duration: z.number().int().nonnegative().optional(),
  eval_duration: z.number().int().nonnegative().optional(),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
});

function metric(value: number | undefined): number {
  return value ?? 0;
}

export class OllamaModel implements StructuredModel {
  readonly #endpoint: URL;

  constructor(endpoint = "http://127.0.0.1:11434") {
    this.#endpoint = new URL(endpoint);
  }

  async generate<T>(
    request: StructuredGeneration<T>,
    signal: AbortSignal,
  ): Promise<StructuredGenerationResult<T>> {
    const startedAt = performance.now();
    const response = await fetch(new URL("/api/chat", this.#endpoint), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.input },
        ],
        stream: false,
        think: request.options.think,
        format: z.toJSONSchema(request.schema),
        keep_alive: request.options.keepAlive,
        options: {
          num_ctx: request.options.contextTokens,
          num_predict: request.options.maxOutputTokens,
          temperature: request.options.temperature,
        },
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}`);
    }

    const envelope = ollamaResponseSchema.parse(await response.json());
    const value = request.schema.parse(JSON.parse(envelope.message.content));
    const metrics: GenerationMetrics = {
      wallDurationNs: Math.round((performance.now() - startedAt) * 1_000_000),
      totalDurationNs: metric(envelope.total_duration),
      loadDurationNs: metric(envelope.load_duration),
      promptEvalDurationNs: metric(envelope.prompt_eval_duration),
      evalDurationNs: metric(envelope.eval_duration),
      promptEvalCount: metric(envelope.prompt_eval_count),
      evalCount: metric(envelope.eval_count),
    };

    return { value, metrics };
  }
}
