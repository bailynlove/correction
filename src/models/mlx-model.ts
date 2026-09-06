import { performance } from "node:perf_hooks";
import { z } from "zod";

import type {
  GenerationMetrics,
  StructuredGeneration,
  StructuredGenerationResult,
  StructuredModel,
} from "./structured-model.js";

const mlxResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
  }).optional(),
});

export class MlxModel implements StructuredModel {
  readonly #endpoint: URL;

  constructor(endpoint = "http://127.0.0.1:18080") {
    this.#endpoint = new URL(endpoint);
  }

  async generate<T>(
    request: StructuredGeneration<T>,
    signal: AbortSignal,
  ): Promise<StructuredGenerationResult<T>> {
    const startedAt = performance.now();
    const schema = z.toJSONSchema(request.schema);
    const response = await fetch(new URL("/v1/chat/completions", this.#endpoint), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // The MLX-LM server is started with one configured model. Supplying a
        // model name here asks it to resolve a different checkpoint.
        messages: [
          {
            role: "system",
            content: `${request.system}\n\nRequired JSON Schema:\n${JSON.stringify(schema)}\nReturn only the JSON object, without Markdown or commentary.`,
          },
          { role: "user", content: request.input },
        ],
        stream: false,
        temperature: request.options.temperature,
        max_tokens: request.options.maxOutputTokens,
        chat_template_kwargs: {
          enable_thinking: request.options.think,
        },
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`MLX endpoint returned HTTP ${response.status}`);
    }

    const envelope = mlxResponseSchema.parse(await response.json());
    const choice = envelope.choices[0];
    if (choice === undefined) throw new Error("MLX endpoint returned no choices");
    const value = request.schema.parse(JSON.parse(choice.message.content));
    const wallDurationNs = Math.round((performance.now() - startedAt) * 1_000_000);
    const metrics: GenerationMetrics = {
      wallDurationNs,
      totalDurationNs: wallDurationNs,
      loadDurationNs: 0,
      promptEvalDurationNs: 0,
      evalDurationNs: 0,
      promptEvalCount: envelope.usage?.prompt_tokens ?? 0,
      evalCount: envelope.usage?.completion_tokens ?? 0,
    };

    return { value, metrics };
  }
}
