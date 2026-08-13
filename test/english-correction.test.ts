import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { z } from "zod";

import type {
  StructuredGeneration,
  StructuredGenerationResult,
  StructuredModel,
} from "../src/models/structured-model.js";
import { EnglishCorrection } from "../src/processors/english-correction/english-correction.js";
import { projectPrompt } from "../src/processors/english-correction/protected-spans.js";

const metrics = {
  wallDurationNs: 1,
  totalDurationNs: 1,
  loadDurationNs: 0,
  promptEvalDurationNs: 1,
  evalDurationNs: 1,
  promptEvalCount: 1,
  evalCount: 1,
};

class ScriptedModel implements StructuredModel {
  readonly #value: unknown;

  constructor(value: unknown) {
    this.#value = value;
  }

  async generate<T>(
    request: StructuredGeneration<T>,
    _signal: AbortSignal,
  ): Promise<StructuredGenerationResult<T>> {
    return { value: request.schema.parse(this.#value), metrics };
  }
}

const options = {
  model: "test",
  contextTokens: 4096,
  maxOutputTokens: 256,
  keepAlive: "5m",
  temperature: 0,
};

describe("EnglishCorrection", () => {
  it("returns a transform with unknown risk", async () => {
    const processor = new EnglishCorrection(
      new ScriptedModel({ changed: true, correctedText: "Please fix this." }),
      options,
    );
    const result = await processor.process(
      "Please fix these.",
      "Please fix these.",
      { host: "test" },
      new AbortController().signal,
    );
    assert.equal(result.kind, "transform");
    if (result.kind === "transform") {
      assert.equal(result.candidate, "Please fix this.");
      assert.equal(result.risk, "unknown");
    }
  });

  it("restores protected content byte-for-byte", async () => {
    const input = "please run `npm test` in ./app";
    const projection = projectPrompt(input);
    const processor = new EnglishCorrection(
      new ScriptedModel({
        changed: true,
        correctedText: `${projection.projectedText.replace(/^please/, "Please")}.`,
      }),
      options,
    );
    const result = await processor.process(
      input,
      input,
      { host: "test" },
      new AbortController().signal,
    );
    assert.equal(result.kind, "transform");
    if (result.kind === "transform") {
      assert.equal(result.candidate, "Please run `npm test` in ./app.");
    }
  });

  it("fails open when a semantic invariant changes", async () => {
    const processor = new EnglishCorrection(
      new ScriptedModel({ changed: true, correctedText: "It may finish in 3 seconds." }),
      options,
    );
    const result = await processor.process(
      "It must finish in 2 seconds.",
      "It must finish in 2 seconds.",
      { host: "test" },
      new AbortController().signal,
    );
    assert.equal(result.kind, "error");
  });

  it("treats contracted and expanded negation as equivalent", async () => {
    const processor = new EnglishCorrection(
      new ScriptedModel({ changed: true, correctedText: "This migration has not been applied." }),
      options,
    );

    const result = await processor.process(
      "This migration hasn't been applied.",
      "This migration hasn't been applied.",
      { host: "test" },
      AbortSignal.timeout(100),
    );

    assert.equal(result.kind, "transform");
  });

  it("preserves quantity spacing and unit case through a typed mask", async () => {
    const input = "the cache may use 64mb";
    const projection = projectPrompt(input);
    const processor = new EnglishCorrection(
      new ScriptedModel({
        correctedText: projection.projectedText.replace(/^the/, "The") + ".",
      }),
      options,
    );
    const result = await processor.process(
      input,
      input,
      { host: "test" },
      AbortSignal.timeout(100),
    );
    assert.equal(result.kind, "transform");
    if (result.kind === "transform") {
      assert.equal(result.candidate, "The cache may use 64mb.");
    }
  });

  it("preserves abbreviated units through a typed mask", async () => {
    const input = "the user may cancel after 1m";
    const projection = projectPrompt(input);
    const processor = new EnglishCorrection(
      new ScriptedModel({
        correctedText: projection.projectedText.replace(/^the/, "The") + ".",
      }),
      options,
    );
    const result = await processor.process(
      input,
      input,
      { host: "test" },
      AbortSignal.timeout(100),
    );
    assert.equal(result.kind, "transform");
    if (result.kind === "transform") {
      assert.equal(result.candidate, "The user may cancel after 1m.");
    }
  });

  it("rejects identifier case changes", async () => {
    const processor = new EnglishCorrection(
      new ScriptedModel({ correctedText: "Do not change SHA256.DEADBEEF." }),
      options,
    );
    const result = await processor.process(
      "do not change sha256.deadbeef",
      "do not change sha256.deadbeef",
      { host: "test" },
      AbortSignal.timeout(100),
    );
    assert.equal(result.kind, "error");
  });
});
