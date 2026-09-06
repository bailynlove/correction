import { createTwoFilesPatch } from "diff";

import type { PipelineOutcome } from "../vertical-slice/pipeline.js";
import { createConfiguredPipeline } from "../vertical-slice/configured-pipeline.js";
import { loadConfig } from "../vertical-slice/config.js";
import { diagnostic, promptMetadata, traceMetadata } from "../vertical-slice/diagnostics.js";
import {
  PromptMediator,
  type MediationResult,
  type ReviewDecision,
  type Reviewer,
} from "../vertical-slice/mediation.js";

interface PiImage {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface PiInputEvent {
  readonly text: string;
  readonly images?: readonly PiImage[];
  readonly source: "interactive" | "rpc" | "extension";
  readonly streamingBehavior?: "steer" | "followUp";
}

export interface PiUi {
  select(title: string, options: string[]): Promise<string | undefined>;
  editor(title: string, prefilled: string): Promise<string | undefined>;
  notify(message: string, type?: "info" | "warning" | "error"): void;
  setStatus(key: string, text: string | undefined): void;
}

export interface PiInputContext {
  readonly cwd: string;
  readonly hasUI: boolean;
  readonly ui: PiUi;
}

export type PiInputResult =
  | { readonly action: "continue" }
  | { readonly action: "transform"; readonly text: string; readonly images?: readonly PiImage[] }
  | { readonly action: "handled" };

export interface PiExtensionApi {
  on(
    event: "input",
    handler: (event: PiInputEvent, context: PiInputContext) => Promise<PiInputResult>,
  ): void;
}

export type PiMediation = (
  text: string,
  context: PiInputContext,
  reviewer: Reviewer,
) => Promise<MediationResult>;

const APPROVE = "Approve correction";
const EDIT = "Edit proposal";
const BYPASS = "Bypass correction";
const CANCEL = "Cancel prompt";
const STATUS_KEY = "correction";

class PiReviewer implements Reviewer {
  readonly #ui: PiUi;

  constructor(ui: PiUi) {
    this.#ui = ui;
  }

  async review(
    outcome: Extract<PipelineOutcome, { kind: "ready" | "review" }>,
  ): Promise<ReviewDecision> {
    this.#ui.setStatus(STATUS_KEY, undefined);
    const summary = outcome.original === outcome.candidate
      ? "No correction proposed."
      : createTwoFilesPatch(
          "original",
          "corrected",
          outcome.original,
          outcome.candidate,
          "",
          "",
          { context: 3 },
        );
    const choice = await this.#ui.select(
      `Correction review\n\n${summary}`,
      [APPROVE, EDIT, BYPASS, CANCEL],
    );
    if (choice === APPROVE) return { kind: "approve" };
    if (choice === BYPASS) return { kind: "bypass" };
    if (choice === EDIT) {
      const text = await this.#ui.editor("Edit prompt before another correction attempt", outcome.candidate);
      return text === undefined ? { kind: "cancel" } : { kind: "edit", text };
    }
    return { kind: "cancel" };
  }
}

async function configuredMediation(
  text: string,
  context: PiInputContext,
  reviewer: Reviewer,
): Promise<MediationResult> {
  const loaded = loadConfig({ cwd: context.cwd });
  const pipeline = createConfiguredPipeline(loaded.config);
  return await new PromptMediator(pipeline, reviewer, {
    approvalMode: loaded.config.approval.mode,
    maxReviewCycles: loaded.config.approval.max_review_cycles,
    onOutcome: (outcome) => {
      for (const notice of "notices" in outcome ? outcome.notices : []) {
        context.ui.notify(notice.message, "warning");
      }
      const hasFailure = outcome.traces.some(
        (trace) => trace.result === "error" || trace.result === "timeout",
      );
      diagnostic(loaded.config.diagnostics.level, hasFailure ? "warn" : "info", "pipeline.completed", {
        host: "pi",
        outcome: outcome.kind,
        ...promptMetadata(outcome.original, loaded.config.diagnostics.content),
        ...traceMetadata(outcome.traces),
      });
    },
  }).mediate(text, { host: "pi" });
}

function shouldPreserveInput(event: PiInputEvent, context: PiInputContext): boolean {
  if (event.source === "extension" || !context.hasUI) return true;
  const trimmed = event.text.trimStart();
  return trimmed.length === 0 || trimmed.startsWith("/") || trimmed.startsWith("!");
}

export function createPiInputHandler(
  mediate: PiMediation = configuredMediation,
): (event: PiInputEvent, context: PiInputContext) => Promise<PiInputResult> {
  return async (event, context) => {
    if (shouldPreserveInput(event, context)) return { action: "continue" };

    context.ui.setStatus(STATUS_KEY, "Correcting prompt…");
    try {
      let result: MediationResult;
      try {
        result = await mediate(event.text, context, new PiReviewer(context.ui));
      } catch (error) {
        context.ui.notify(
          `Correction configuration failed; the original prompt was preserved: ${error instanceof Error ? error.message : String(error)}`,
          "warning",
        );
        return { action: "continue" };
      }

      if (result.kind === "blocked") {
        context.ui.notify(`Correction blocked the prompt: ${result.reason}`, "error");
        return { action: "handled" };
      }
      if (result.kind === "cancelled") {
        context.ui.notify("Prompt cancelled.", "info");
        return { action: "handled" };
      }
      if (result.text === event.text) return { action: "continue" };
      return {
        action: "transform",
        text: result.text,
        ...(event.images === undefined ? {} : { images: event.images }),
      };
    } finally {
      context.ui.setStatus(STATUS_KEY, undefined);
    }
  };
}

export default function correctionPiExtension(pi: PiExtensionApi): void {
  pi.on("input", createPiInputHandler());
}
