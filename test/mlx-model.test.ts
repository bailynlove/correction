import assert from "node:assert/strict";
import { it } from "node:test";

import { z } from "zod";

import { MlxModel } from "../src/models/mlx-model.js";

it("disables reasoning through the MLX chat template when requested", async () => {
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ correctedText: "Corrected." }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    }));
  };

  try {
    const model = new MlxModel("http://127.0.0.1:18080");
    await model.generate({
      model: "test-model",
      system: "Correct the text.",
      input: "incorrect text",
      schema: z.object({ correctedText: z.string() }),
      options: {
        contextTokens: 4096,
        maxOutputTokens: 128,
        keepAlive: "5m",
        temperature: 0,
        think: false,
      },
    }, AbortSignal.timeout(1_000));
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(body?.chat_template_kwargs, { enable_thinking: false });
});
