import type { PromptPipeline } from "./pipeline.js";
import {
  PromptMediator,
  type MediationOptions,
  type Reviewer,
} from "./mediation.js";

export type { ReviewDecision, Reviewer } from "./mediation.js";

export interface HostSession {
  readonly threadId: string;
  runTurn(prompt: string): Promise<void>;
  close(): Promise<void>;
}

export type SessionOptions = MediationOptions;

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
    const result = await new PromptMediator(this.#pipeline, this.#reviewer, this.#options)
      .mediate(input, { host: "codex" });
    if (result.kind !== "ready") return result;
    await this.#host.runTurn(result.text);
    return { kind: "sent", text: result.text, source: result.source };
  }
}
