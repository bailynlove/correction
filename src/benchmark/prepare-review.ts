import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { curatedCorpus } from "./corpus.js";

interface RawRecord {
  readonly model: string;
  readonly caseId: string;
  readonly run: number;
  readonly output: string;
}

interface ReviewRow {
  readonly reviewId: string;
  readonly caseId: string;
  readonly category: string;
  readonly input: string;
  readonly reference: string;
  readonly output: string;
  readonly model: string;
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1] ?? fallback;
}

function shuffled<T>(items: readonly T[], initialSeed: number): T[] {
  const result = [...items];
  let state = initialSeed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const target = Math.floor(((state >>> 0) / 0x1_0000_0000) * (index + 1));
    [result[index], result[target]] = [result[target] as T, result[index] as T];
  }
  return result;
}

function csv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function render(rows: readonly ReviewRow[]): string {
  const header = [
    "review_id", "category", "input", "reference", "candidate_output",
    "meaning_fidelity_pass", "completeness_0_3", "british_naturalness_0_3",
    "restraint_0_3", "adversarial_contract_pass", "notes",
  ];
  return `${header.map(csv).join(",")}\n${rows.map((row) => [
    row.reviewId, row.category, row.input, row.reference, row.output, "", "", "", "", "", "",
  ].map(csv).join(",")).join("\n")}\n`;
}

async function main(): Promise<void> {
  const resultsDirectory = option("results", "benchmark/results");
  const outputDirectory = option("out", "benchmark/review");
  const cases = new Map(curatedCorpus().map((testCase) => [testCase.id, testCase]));
  const files = (await readdir(resultsDirectory))
    .filter((file) => file.endsWith(".jsonl") && !file.endsWith(".structural.jsonl"));
  const records = (await Promise.all(files.map(async (file) =>
    (await readFile(join(resultsDirectory, file), "utf8"))
      .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as RawRecord),
  ))).flat().filter((record) => record.run === 1);
  const shuffledRecords = shuffled(records, 0xb11d2026);
  const rows = shuffledRecords.map((record, index): ReviewRow => {
    const testCase = cases.get(record.caseId);
    if (testCase === undefined) throw new Error(`unknown case ${record.caseId}`);
    return {
      reviewId: `R${(index + 1).toString().padStart(4, "0")}`,
      caseId: record.caseId,
      category: testCase.category,
      input: testCase.input,
      reference: testCase.acceptableCorrections.join(" | "),
      output: record.output,
      model: record.model,
    };
  });

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "reviewer-a.csv"), render(rows));
  await writeFile(join(outputDirectory, "reviewer-b.csv"), render(shuffled(rows, 0xb11d2027)));
  await writeFile(
    join(outputDirectory, "private-mapping.json"),
    `${JSON.stringify(rows.map(({ reviewId, caseId, model }) => ({ reviewId, caseId, model })), null, 2)}\n`,
  );
  process.stdout.write(`Prepared ${rows.length} blinded outputs for each reviewer.\n`);
}

await main();
