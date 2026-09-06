import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Processor, ProcessorResult } from "../src/pipeline/processor.js";
import { PromptPipeline } from "../src/vertical-slice/pipeline.js";
import {
  CorrectionSession,
  type HostSession,
  type ReviewDecision,
  type Reviewer,
} from "../src/vertical-slice/session.js";

const metrics = {
  wallDurationNs: 1,
  totalDurationNs: 1,
  loadDurationNs: 0,
  promptEvalDurationNs: 0,
  evalDurationNs: 0,
  promptEvalCount: 0,
  evalCount: 0,
};

function scriptedProcessor(
  run: (candidate: string, signal: AbortSignal) => Promise<ProcessorResult>,
): Processor {
  return {
    process: async (_original, candidate, _context, signal) => run(candidate, signal),
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe("PromptPipeline deadlines", () => {
  it("passes the active host to every processor", async () => {
    let observedHost: string | undefined;
    const processor: Processor = {
      process: async (_original, _candidate, context) => {
        observedHost = context.host;
        return { kind: "pass", metrics };
      },
    };
    const pipeline = new PromptPipeline([
      { name: "corrector", processor, onError: "continue", timeoutMs: 50 },
    ], 100);

    await pipeline.run("Original prompt.", { host: "pi" });

    assert.equal(observedHost, "pi");
  });

  it("fails open at the processor deadline and preserves the original", async () => {
    const processor = scriptedProcessor(async () => {
      await delay(80);
      return {
        kind: "transform",
        candidate: "A late candidate.",
        risk: "unknown",
        reasons: [],
        metrics,
      };
    });
    const pipeline = new PromptPipeline([
      { name: "corrector", processor, onError: "continue", timeoutMs: 10 },
    ], 100);

    const outcome = await pipeline.run("Original prompt.", { host: "test" });

    assert.equal(outcome.kind, "ready");
    if (outcome.kind === "ready") {
      assert.equal(outcome.candidate, "Original prompt.");
      assert.deepEqual(outcome.notices.map((notice) => notice.code), ["processor-timeout"]);
      assert.equal(outcome.traces[0]?.result, "timeout");
    }

    await delay(90);
    assert.equal(outcome.kind === "ready" ? outcome.candidate : undefined, "Original prompt.");
  });

  it("fails closed when a timed-out processor is configured to block", async () => {
    const processor = scriptedProcessor(async () => {
      await delay(50);
      return { kind: "pass", metrics };
    });
    const pipeline = new PromptPipeline([
      { name: "security", processor, onError: "block", timeoutMs: 5 },
    ], 100);

    const outcome = await pipeline.run("Original prompt.", { host: "test" });

    assert.deepEqual(outcome.kind, "failed");
    if (outcome.kind === "failed") assert.equal(outcome.reason, "security timed out");
  });

  it("enforces the independent pipeline deadline", async () => {
    const processor = scriptedProcessor(async () => {
      await delay(80);
      return { kind: "pass", metrics };
    });
    const pipeline = new PromptPipeline([
      { name: "corrector", processor, onError: "continue", timeoutMs: 100 },
    ], 10);

    const outcome = await pipeline.run("Original prompt.", { host: "test" });

    assert.equal(outcome.kind, "failed");
    if (outcome.kind === "failed") assert.equal(outcome.reason, "pipeline timed out");
    assert.equal(outcome.traces[0]?.code, "pipeline-timeout");
  });

  it("keeps generic fail-open errors distinct from timeouts", async () => {
    const processor = scriptedProcessor(async () => {
      throw new Error("runtime unavailable");
    });
    const pipeline = new PromptPipeline([
      { name: "corrector", processor, onError: "continue", timeoutMs: 50 },
    ], 100);

    const outcome = await pipeline.run("Original prompt.", { host: "test" });

    assert.equal(outcome.kind, "ready");
    if (outcome.kind === "ready") {
      assert.deepEqual(outcome.notices.map((notice) => notice.code), ["processor-error"]);
      assert.equal(outcome.traces[0]?.result, "error");
    }
  });
});

class RecordingHost implements HostSession {
  readonly threadId = "test-thread";
  readonly prompts: string[] = [];

  async runTurn(prompt: string): Promise<void> {
    this.prompts.push(prompt);
  }

  async close(): Promise<void> {}
}

class FixedReviewer implements Reviewer {
  readonly #decision: ReviewDecision;
  reviews = 0;

  constructor(decision: ReviewDecision) {
    this.#decision = decision;
  }

  async review(): Promise<ReviewDecision> {
    this.reviews += 1;
    return this.#decision;
  }
}

describe("CorrectionSession timeout review", () => {
  it("reviews a fail-open timeout and cancellation sends no host turn", async () => {
    const processor = scriptedProcessor(async () => {
      await delay(50);
      return { kind: "pass", metrics };
    });
    const pipeline = new PromptPipeline([
      { name: "corrector", processor, onError: "continue", timeoutMs: 5 },
    ], 100);
    const reviewer = new FixedReviewer({ kind: "cancel" });
    const host = new RecordingHost();
    const session = new CorrectionSession(pipeline, reviewer, host, {
      approvalMode: "always",
      maxReviewCycles: 3,
    });

    const result = await session.submit("Original prompt.");

    assert.equal(result.kind, "cancelled");
    assert.equal(reviewer.reviews, 1);
    assert.deepEqual(host.prompts, []);
  });

  it("approval after fail-open sends only the immutable original", async () => {
    const processor = scriptedProcessor(async () => {
      await delay(50);
      return {
        kind: "transform",
        candidate: "Late candidate.",
        risk: "unknown",
        reasons: [],
        metrics,
      };
    });
    const pipeline = new PromptPipeline([
      { name: "corrector", processor, onError: "continue", timeoutMs: 5 },
    ], 100);
    const host = new RecordingHost();
    const session = new CorrectionSession(
      pipeline,
      new FixedReviewer({ kind: "approve" }),
      host,
      { approvalMode: "always", maxReviewCycles: 3 },
    );

    const result = await session.submit("Original prompt.");

    assert.deepEqual(result, {
      kind: "sent",
      text: "Original prompt.",
      source: "candidate",
    });
    assert.deepEqual(host.prompts, ["Original prompt."]);
    await delay(60);
    assert.deepEqual(host.prompts, ["Original prompt."]);
  });
});
