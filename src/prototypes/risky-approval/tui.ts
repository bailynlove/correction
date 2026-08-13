// PROTOTYPE — wipe me after GitHub issue #10 is resolved.

import { emitKeypressEvents } from "node:readline";

import { evaluatePrototype, type EvaluatedCase } from "./evaluate.js";

const bold = "\u001B[1m";
const dim = "\u001B[2m";
const reset = "\u001B[0m";

const evaluation = await evaluatePrototype();
let filtered = evaluation.cases;
let index = 0;

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function renderCase(item: EvaluatedCase): void {
  console.clear();
  console.log(`${bold}Risky approval classifier — PROTOTYPE${reset}`);
  console.log(`${dim}Question: can deterministic signals safely suppress review for low-risk transformations?${reset}\n`);
  console.log(`${bold}Retrospective state${reset}`);
  console.log(`recall:             ${evaluation.recalled}/${evaluation.reviewRequired} (${percent(evaluation.recall)})`);
  console.log(`false reviews:      ${evaluation.falseReviews}/${evaluation.safeCorrections} (${percent(evaluation.falseReviewRate)})`);
  console.log(`ambiguous outputs:  ${evaluation.transformedAmbiguousInputs}/${evaluation.ambiguousInputs} transformed`);
  console.log(`model confidence:   unavailable`);
  console.log(`readiness:          ${evaluation.readiness}`);
  console.log(`target result:      ${evaluation.passesRetrospectiveTargets ? "pass" : "fail"}\n`);
  console.log(`${bold}Case ${index + 1}/${filtered.length}${reset}`);
  console.log(`id:                 ${item.id}`);
  console.log(`evidence:           ${item.evidence}`);
  console.log(`expected review:    ${item.expectedReview}`);
  console.log(`classified risk:    ${item.classification.risk}`);
  console.log(`reasons:            ${item.classification.reasons.join(", ")}`);
  console.log(`input:              ${item.input}`);
  console.log(`candidate:          ${item.output}\n`);
  console.log(`${bold}[n]${reset} ${dim}next${reset}  ${bold}[p]${reset} ${dim}previous${reset}  ${bold}[r]${reset} ${dim}reviewed only${reset}  ${bold}[l]${reset} ${dim}low only${reset}  ${bold}[a]${reset} ${dim}all${reset}  ${bold}[q]${reset} ${dim}quit${reset}`);
}

function render(): void {
  const item = filtered[index];
  if (item === undefined) throw new Error("prototype filter produced no cases");
  renderCase(item);
}

if (!process.stdin.isTTY) {
  console.log(JSON.stringify({
    safeCorrections: evaluation.safeCorrections,
    falseReviews: evaluation.falseReviews,
    falseReviewRate: evaluation.falseReviewRate,
    reviewRequired: evaluation.reviewRequired,
    recalled: evaluation.recalled,
    recall: evaluation.recall,
    ambiguousInputs: evaluation.ambiguousInputs,
    transformedAmbiguousInputs: evaluation.transformedAmbiguousInputs,
    modelDerivedSignalAvailable: evaluation.modelDerivedSignalAvailable,
    passesRetrospectiveTargets: evaluation.passesRetrospectiveTargets,
    readiness: evaluation.readiness,
  }, null, 2));
  process.exit(0);
}

emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.resume();
render();
process.stdin.on("keypress", (_input, key) => {
  if (key.name === "q" || (key.ctrl === true && key.name === "c")) process.exit(0);
  if (key.name === "n") index = (index + 1) % filtered.length;
  if (key.name === "p") index = (index - 1 + filtered.length) % filtered.length;
  if (key.name === "r") filtered = evaluation.cases.filter((item) => item.classification.risk !== "low");
  if (key.name === "l") filtered = evaluation.cases.filter((item) => item.classification.risk === "low");
  if (key.name === "a") filtered = evaluation.cases;
  if (["r", "l", "a"].includes(key.name ?? "")) index = 0;
  render();
});
