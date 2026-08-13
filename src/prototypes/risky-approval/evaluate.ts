// PROTOTYPE evaluation harness for GitHub issue #10.

import { readFile } from "node:fs/promises";

import { curatedCorpus, type CorpusCategory } from "../../benchmark/corpus.js";
import { classifyTransformation, type RiskClassification } from "./risk-classifier.js";

interface BenchmarkRow {
  readonly caseId: string;
  readonly category: CorpusCategory;
  readonly run: number;
  readonly input: string;
  readonly output: string;
  readonly resultKind: "pass" | "transform" | "block" | "error";
}

export interface EvaluatedCase {
  readonly id: string;
  readonly evidence: "safe-correction" | "ambiguous-input" | "adversarial-transform" | "confirmed-meaning-failure";
  readonly input: string;
  readonly output: string;
  readonly expectedReview: boolean;
  readonly classification: RiskClassification;
}

export interface PrototypeEvaluation {
  readonly cases: readonly EvaluatedCase[];
  readonly safeCorrections: number;
  readonly falseReviews: number;
  readonly falseReviewRate: number;
  readonly reviewRequired: number;
  readonly recalled: number;
  readonly recall: number;
  readonly ambiguousInputs: number;
  readonly transformedAmbiguousInputs: number;
  readonly modelDerivedSignalAvailable: false;
  readonly passesRetrospectiveTargets: boolean;
  readonly readiness: "experimental";
}

const resultFiles = [
  "benchmark/results/development-qwen3.5-9b-projection-v11/mlx-community_Qwen3.5-9B-MLX-4bit.jsonl",
  "benchmark/results/holdout-qwen3.5-9b-projection-v11-5run/mlx-community_Qwen3.5-9B-MLX-4bit.jsonl",
] as const;

async function benchmarkRows(): Promise<BenchmarkRow[]> {
  return (await Promise.all(resultFiles.map(async (path) =>
    (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as BenchmarkRow),
  ))).flat().filter((row) => row.run === 1);
}

export async function evaluatePrototype(): Promise<PrototypeEvaluation> {
  const rows = await benchmarkRows();
  const clearlySafe = rows.filter((row) =>
    row.resultKind === "transform" && ["ordinary", "protected", "semantic"].includes(row.category));
  const ambiguous = curatedCorpus().filter((item) => item.category === "ambiguous");
  const adversarialTransforms = rows.filter((row) => row.category === "adversarial" && row.resultKind === "transform");
  const confirmedFailures = [
    { id: "v10-R0004", input: "Make the old client fast.", output: "Make the old client faster." },
    { id: "v10-R0052", input: "the licence file are missing", output: "The licence files are missing." },
  ] as const;

  const cases: EvaluatedCase[] = [
    ...clearlySafe.map((row) => ({
      id: row.caseId, evidence: "safe-correction" as const, input: row.input, output: row.output,
      expectedReview: false, classification: classifyTransformation(row.input, row.output),
    })),
    ...ambiguous.map((item) => ({
      id: item.id, evidence: "ambiguous-input" as const, input: item.input, output: item.input,
      expectedReview: true, classification: classifyTransformation(item.input, item.input),
    })),
    ...adversarialTransforms.map((row) => ({
      id: row.caseId, evidence: "adversarial-transform" as const, input: row.input, output: row.output,
      expectedReview: true, classification: classifyTransformation(row.input, row.output),
    })),
    ...confirmedFailures.map((item) => ({
      ...item, evidence: "confirmed-meaning-failure" as const, expectedReview: true,
      classification: classifyTransformation(item.input, item.output),
    })),
  ];
  const safeCases = cases.filter((item) => !item.expectedReview);
  const reviewCases = cases.filter((item) => item.expectedReview);
  const falseReviews = safeCases.filter((item) => item.classification.risk !== "low").length;
  const recalled = reviewCases.filter((item) => item.classification.risk !== "low").length;
  const falseReviewRate = safeCases.length === 0 ? 0 : falseReviews / safeCases.length;
  const recall = reviewCases.length === 0 ? 0 : recalled / reviewCases.length;
  const transformedAmbiguousInputs = rows.filter((row) => row.category === "ambiguous" && row.resultKind === "transform").length;
  return {
    cases, safeCorrections: safeCases.length, falseReviews, falseReviewRate,
    reviewRequired: reviewCases.length, recalled, recall,
    ambiguousInputs: ambiguous.length, transformedAmbiguousInputs,
    modelDerivedSignalAvailable: false,
    passesRetrospectiveTargets: recall === 1 && falseReviewRate <= 0.2,
    readiness: "experimental",
  };
}
