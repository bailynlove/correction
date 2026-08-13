import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { createTwoFilesPatch } from "diff";

import type { PipelineOutcome } from "./pipeline.js";
import type { ReviewDecision, Reviewer } from "./session.js";

type ReviewableOutcome = Extract<PipelineOutcome, { kind: "ready" | "review" }>;

export class TerminalUi implements Reviewer {
  readonly #readline: Interface;

  constructor() {
    this.#readline = createInterface({ input: stdin, output: stdout });
  }

  async prompt(): Promise<string> {
    return this.#readline.question("you> ");
  }

  async review(outcome: ReviewableOutcome): Promise<ReviewDecision> {
    if (outcome.original === outcome.candidate) {
      stdout.write("\nNo correction proposed.\n");
    } else {
      stdout.write(`\n${createTwoFilesPatch("original", "corrected", outcome.original, outcome.candidate, "", "", { context: 3 })}\n`);
    }
    const answer = (await this.#readline.question("[a]pprove, [e]dit, [b]ypass correction, [c]ancel: ")).trim().toLowerCase();
    if (answer === "a" || answer === "approve" || answer === "") return { kind: "approve" };
    if (answer === "b" || answer === "bypass") return { kind: "bypass" };
    if (answer === "e" || answer === "edit") {
      return { kind: "edit", text: await this.#readline.question("replacement prompt> ") };
    }
    return { kind: "cancel" };
  }

  async approveHostAction(summary: string): Promise<"accept" | "decline"> {
    stdout.write(`\nCodex requests approval:\n${summary}\n`);
    const answer = (await this.#readline.question("Allow? [y/N] ")).trim().toLowerCase();
    return answer === "y" || answer === "yes" ? "accept" : "decline";
  }

  close(): void {
    this.#readline.close();
  }
}
