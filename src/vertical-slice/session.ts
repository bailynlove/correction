import type { PromptPipeline, PipelineOutcome } from "./pipeline.js";

export type ReviewDecision =
  | { readonly kind: "approve" }
  | { readonly kind: "edit"; readonly text: string }
  | { readonly kind: "bypass" }
  | { readonly kind: "cancel" };

export interface Reviewer {
  review(outcome: Extract<PipelineOutcome, { kind: "ready" | "review" }>): Promise<ReviewDecision>;
}

export interface HostSession {
  readonly threadId: string;
  runTurn(prompt: string): Promise<void>;
  close(): Promise<void>;
}

export interface SessionOptions {
  readonly approvalMode: "always" | "risky" | "never";
  readonly maxReviewCycles: number;
  readonly onOutcome?: (outcome: PipelineOutcome) => void;
}

export type SubmissionResult =
  | { readonly kind: "sent"; readonly text: string; readonly source: "candidate" | "original" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "blocked"; readonly reason: string };

export class CorrectionSession {
  readonly #pipeline: PromptPipeline;
  readonly #reviewer: Reviewer;
  readonly #host: HostSession;
  readonly #options: SessionOptions;

  constructor(pipeline: PromptPipeline, reviewer: Reviewer, host: HostSession, options: SessionOptions) {
    this.#pipeline = pipeline;
    this.#reviewer = reviewer;
    this.#host = host;
    this.#options = options;
  }

  async submit(input: string): Promise<SubmissionResult> {
    const immutableOriginal = input;
    let edited = input;
    for (let cycle = 0; cycle <= this.#options.maxReviewCycles; cycle += 1) {
      const outcome = await this.#pipeline.run(edited);
      this.#options.onOutcome?.(outcome);
      if (outcome.kind === "blocked" || outcome.kind === "failed") {
        return { kind: "blocked", reason: outcome.reason };
      }

      const needsReview = this.#options.approvalMode === "always"
        || (this.#options.approvalMode === "risky" && outcome.risk !== "low");
      if (!needsReview) {
        await this.#host.runTurn(outcome.candidate);
        return { kind: "sent", text: outcome.candidate, source: "candidate" };
      }

      const decision = await this.#reviewer.review(outcome);
      if (decision.kind === "cancel") return { kind: "cancelled" };
      if (decision.kind === "bypass") {
        await this.#host.runTurn(immutableOriginal);
        return { kind: "sent", text: immutableOriginal, source: "original" };
      }
      if (decision.kind === "approve") {
        await this.#host.runTurn(outcome.candidate);
        return { kind: "sent", text: outcome.candidate, source: "candidate" };
      }
      edited = decision.text;
    }
    return { kind: "blocked", reason: "maximum review cycles reached" };
  }
}
