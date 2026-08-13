import { z } from "zod";

import type { StructuredModel } from "../../models/structured-model.js";
import type {
  ProcessingContext,
  Processor,
  ProcessorResult,
} from "../../pipeline/processor.js";
import { projectPrompt } from "./protected-spans.js";
import { assertSemanticInvariantsPreserved } from "./semantic-invariants.js";
import { ENGLISH_CORRECTION_SYSTEM_PROMPT } from "./template.js";

const correctionSchema = z.object({
  correctedText: z.string().describe("The complete corrected prompt, with every opaque placeholder copied exactly."),
});

export interface EnglishCorrectionOptions {
  readonly model: string;
  readonly contextTokens: number;
  readonly maxOutputTokens: number;
  readonly keepAlive: string;
  readonly temperature: number;
  readonly debugContent?: boolean;
}

export class EnglishCorrection implements Processor {
  readonly #structuredModel: StructuredModel;
  readonly #options: EnglishCorrectionOptions;

  constructor(
    structuredModel: StructuredModel,
    options: EnglishCorrectionOptions,
  ) {
    this.#structuredModel = structuredModel;
    this.#options = options;
  }

  async process(
    _original: string,
    candidate: string,
    _context: ProcessingContext,
    signal: AbortSignal,
  ): Promise<ProcessorResult> {
    const projection = projectPrompt(candidate);
    let debugCandidate: string | undefined;
    try {
      const result = await this.#structuredModel.generate(
        {
          model: this.#options.model,
          system: ENGLISH_CORRECTION_SYSTEM_PROMPT,
          input: `<BEGIN_TEXT_TO_EDIT>\n${projection.projectedText}\n<END_TEXT_TO_EDIT>`,
          schema: correctionSchema,
          options: {
            contextTokens: this.#options.contextTokens,
            maxOutputTokens: this.#options.maxOutputTokens,
            keepAlive: this.#options.keepAlive,
            temperature: this.#options.temperature,
            think: false,
          },
        },
        signal,
      );

      const restored = projection.restore(result.value.correctedText);
      debugCandidate = restored;
      if (restored === candidate) {
        return { kind: "pass", metrics: result.metrics };
      }

      assertSemanticInvariantsPreserved(candidate, restored);
      return {
        kind: "transform",
        candidate: restored,
        risk: "unknown",
        reasons: ["risk-not-calibrated"],
        metrics: result.metrics,
      };
    } catch (error) {
      return {
        kind: "error",
        code: "english-correction-failed",
        message: error instanceof Error ? error.message : "unknown correction failure",
        ...(this.#options.debugContent === true && debugCandidate !== undefined ? { debugCandidate } : {}),
      };
    }
  }
}
