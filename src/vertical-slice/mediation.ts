import type { ProcessingContext } from "../pipeline/processor.js";
import type { PipelineOutcome, PromptPipeline } from "./pipeline.js";

export type ReviewDecision =
  | { readonly kind: "approve" }
  | { readonly kind: "edit"; readonly text: string }
  | { readonly kind: "bypass" }
  | { readonly kind: "cancel" };

export interface Reviewer {
  review(outcome: Extract<PipelineOutcome, { kind: "ready" | "review" }>): Promise<ReviewDecision>;
}

export interface MediationOptions {
  readonly approvalMode: "always" | "risky" | "never";
  readonly maxReviewCycles: number;
  readonly onOutcome?: (outcome: PipelineOutcome) => void;
}

export type MediationResult =
  | { readonly kind: "ready"; readonly text: string; readonly source: "candidate" | "original" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "blocked"; readonly reason: string };

export class PromptMediator {
  readonly #pipeline: PromptPipeline;
  readonly #reviewer: Reviewer;
  readonly #options: MediationOptions;

  constructor(pipeline: PromptPipeline, reviewer: Reviewer, options: MediationOptions) {
    this.#pipeline = pipeline;
    this.#reviewer = reviewer;
    this.#options = options;
  }

  async mediate(input: string, context: ProcessingContext): Promise<MediationResult> {
    let attemptOriginal = input;
    for (let cycle = 0; cycle <= this.#options.maxReviewCycles; cycle += 1) {
      const outcome = await this.#pipeline.run(attemptOriginal, context);
      this.#options.onOutcome?.(outcome);
      if (outcome.kind === "blocked" || outcome.kind === "failed") {
        return { kind: "blocked", reason: outcome.reason };
      }

      const needsReview = this.#options.approvalMode === "always"
        || (this.#options.approvalMode === "risky" && outcome.risk !== "low");
      if (!needsReview) {
        return { kind: "ready", text: outcome.candidate, source: "candidate" };
      }

      const decision = await this.#reviewer.review(outcome);
      if (decision.kind === "cancel") return { kind: "cancelled" };
      if (decision.kind === "bypass") {
        return { kind: "ready", text: attemptOriginal, source: "original" };
      }
      if (decision.kind === "approve") {
        return { kind: "ready", text: outcome.candidate, source: "candidate" };
      }
      attemptOriginal = decision.text;
    }
    return { kind: "blocked", reason: "maximum review cycles reached" };
  }
}
