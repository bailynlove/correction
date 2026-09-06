import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPiInputHandler,
  type PiInputContext,
  type PiMediation,
} from "../src/integrations/pi-extension.js";
import type { PipelineOutcome } from "../src/vertical-slice/pipeline.js";

class FakeUi {
  selection: string | undefined;
  edited: string | undefined;
  readonly notifications: Array<{ message: string; type?: string }> = [];
  readonly statuses: Array<{ key: string; text: string | undefined }> = [];

  async select(): Promise<string | undefined> {
    return this.selection;
  }

  async editor(): Promise<string | undefined> {
    return this.edited;
  }

  notify(message: string, type?: "info" | "warning" | "error"): void {
    this.notifications.push({ message, ...(type === undefined ? {} : { type }) });
  }

  setStatus(key: string, text: string | undefined): void {
    this.statuses.push({ key, text });
  }
}

function context(ui = new FakeUi(), hasUI = true): PiInputContext {
  return { cwd: "/tmp/correction-test", hasUI, ui };
}

describe("Pi input integration", () => {
  it("preserves slash commands and user Bash for Pi to handle", async () => {
    let called = false;
    const handler = createPiInputHandler(async () => {
      called = true;
      return { kind: "ready", text: "changed", source: "candidate" };
    });

    const result = await handler(
      { text: "/skill:review", source: "interactive" },
      context(),
    );

    assert.deepEqual(result, { action: "continue" });
    assert.deepEqual(
      await handler({ text: "!git status", source: "interactive" }, context()),
      { action: "continue" },
    );
    assert.equal(called, false);
  });

  it("preserves extension-injected and non-interactive input", async () => {
    let calls = 0;
    const handler = createPiInputHandler(async () => {
      calls += 1;
      return { kind: "ready", text: "changed", source: "candidate" };
    });

    assert.deepEqual(
      await handler({ text: "extension message", source: "extension" }, context()),
      { action: "continue" },
    );
    assert.deepEqual(
      await handler({ text: "print message", source: "interactive" }, context(new FakeUi(), false)),
      { action: "continue" },
    );
    assert.equal(calls, 0);
  });

  it("transforms an approved prompt without dropping images", async () => {
    const images = [{ type: "image", data: "opaque" }];
    const handler = createPiInputHandler(async () => ({
      kind: "ready",
      text: "Please change the colour.",
      source: "candidate",
    }));

    const result = await handler(
      { text: "please change the color", images, source: "interactive" },
      context(),
    );

    assert.deepEqual(result, {
      action: "transform",
      text: "Please change the colour.",
      images,
    });
  });

  it("continues unchanged after bypass or fail-open preservation", async () => {
    const handler = createPiInputHandler(async (text) => ({
      kind: "ready",
      text,
      source: "original",
    }));

    assert.deepEqual(
      await handler({ text: "keep this", source: "interactive" }, context()),
      { action: "continue" },
    );
  });

  it("handles blocked and cancelled prompts without invoking Pi's agent", async () => {
    const blocked = createPiInputHandler(async () => ({ kind: "blocked", reason: "unsafe" }));
    const cancelled = createPiInputHandler(async () => ({ kind: "cancelled" }));
    const blockedUi = new FakeUi();
    const cancelledUi = new FakeUi();

    assert.deepEqual(
      await blocked({ text: "blocked", source: "interactive" }, context(blockedUi)),
      { action: "handled" },
    );
    assert.deepEqual(
      await cancelled({ text: "cancelled", source: "interactive" }, context(cancelledUi)),
      { action: "handled" },
    );
    assert.match(blockedUi.notifications[0]?.message ?? "", /unsafe/);
    assert.match(cancelledUi.notifications[0]?.message ?? "", /cancelled/i);
  });

  it("maps Pi review choices to approve, edit, bypass, and cancel", async () => {
    const outcome: Extract<PipelineOutcome, { kind: "review" }> = {
      kind: "review",
      original: "change color",
      candidate: "Change colour.",
      risk: "unknown",
      reasons: ["risk-not-calibrated"],
      notices: [],
      traces: [],
    };
    const cases = [
      { selection: "Approve correction", expected: { kind: "approve" } },
      { selection: "Bypass correction", expected: { kind: "bypass" } },
      { selection: "Cancel prompt", expected: { kind: "cancel" } },
    ] as const;

    for (const testCase of cases) {
      const ui = new FakeUi();
      ui.selection = testCase.selection;
      let decision: unknown;
      const mediation: PiMediation = async (_text, _context, reviewer) => {
        decision = await reviewer.review(outcome);
        return { kind: "cancelled" };
      };
      await createPiInputHandler(mediation)(
        { text: outcome.original, source: "interactive" },
        context(ui),
      );
      assert.deepEqual(decision, testCase.expected);
    }

    const editUi = new FakeUi();
    editUi.selection = "Edit proposal";
    editUi.edited = "Edited prompt.";
    let editDecision: unknown;
    await createPiInputHandler(async (_text, _context, reviewer) => {
      editDecision = await reviewer.review(outcome);
      return { kind: "cancelled" };
    })({ text: outcome.original, source: "interactive" }, context(editUi));
    assert.deepEqual(editDecision, { kind: "edit", text: "Edited prompt." });
  });

  it("fails open when configuration cannot be loaded", async () => {
    const ui = new FakeUi();
    const handler = createPiInputHandler(async () => {
      throw new Error("invalid config");
    });

    assert.deepEqual(
      await handler({ text: "original", source: "interactive" }, context(ui)),
      { action: "continue" },
    );
    assert.match(ui.notifications[0]?.message ?? "", /original prompt was preserved/);
  });

  it("shows native status while prompt mediation is pending and clears it afterwards", async () => {
    const ui = new FakeUi();
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = createPiInputHandler(async (text) => {
      await pending;
      return { kind: "ready", text, source: "original" };
    });

    const result = handler({ text: "please wait", source: "interactive" }, context(ui));
    await Promise.resolve();
    assert.deepEqual(ui.statuses, [{ key: "correction", text: "Correcting prompt…" }]);

    release?.();
    assert.deepEqual(await result, { action: "continue" });
    assert.deepEqual(ui.statuses.at(-1), { key: "correction", text: undefined });
  });
});
