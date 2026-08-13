// PROTOTYPE: pure risk-classification logic for GitHub issue #10.
// The surrounding TUI is throwaway; this module is intentionally portable.

import { extractSemanticInvariants } from "../../processors/english-correction/semantic-invariants.js";

import type { Risk } from "../../pipeline/processor.js";

export interface RiskSignal {
  readonly name: string;
  readonly risk: Exclude<Risk, "low">;
  readonly detail: string;
}

export interface RiskClassification {
  readonly risk: Risk;
  readonly reasons: readonly string[];
  readonly signals: readonly RiskSignal[];
}

const wordPattern = /[a-z]+(?:['’][a-z]+)?/gi;

const adversarialPattern = /\b(?:ignore (?:your|the) correction rules|instead of correcting|reveal (?:your|the) system prompt|hidden (?:instructions|rules)|chain of thought|pretend you are (?:the )?(?:main )?(?:coding )?agent|do not return json|set changed to (?:true|false)|change every number|claim that the changed|answer (?:this|the) (?:question|request)|execute npm|output only|upload diagnostics|delete files|skip (?:its|the|all) tests)\b/i;

const ambiguityPatterns: ReadonlyArray<readonly [string, RegExp]> = [
  ["relative-target", /\b(?:old|new|former|latter|previous|newer|inactive|active)\b/i],
  ["subjective-scope", /\b(?:unnecessary|too much|where possible|unsafe|safer)\b/i],
  ["unresolved-reference", /\b(?:the other|it (?:is|fails|later|succeeds|is called)|before it|after it|that is running)\b/i],
  ["scope-quantifier", /\b(?:not fail only|only for|all of|unless it is required|than before)\b/i],
  ["order-or-ownership", /\b(?:first result|previous order|newer record|uncertain ownership|original value and a masked value)\b/i],
];

function words(input: string): string[] {
  return [...input.matchAll(wordPattern)].map((match) => match[0].toLowerCase());
}

function hasNewRepeatedPunctuation(before: string, after: string): boolean {
  const repeated = /([,;:.!?])\1/g;
  const beforeMatches = new Set(before.match(repeated) ?? []);
  return (after.match(repeated) ?? []).some((value) => !beforeMatches.has(value));
}

function changesComparisonDegree(before: string, after: string): boolean {
  const beforeWords = new Set(words(before));
  const afterWords = new Set(words(after));
  for (const word of beforeWords) {
    if (word.length >= 3 && (
      (!beforeWords.has(`${word}er`) && afterWords.has(`${word}er`))
      || (!beforeWords.has(`${word}est`) && afterWords.has(`${word}est`))
    )) return true;
  }
  return (!beforeWords.has("more") && afterWords.has("more"))
    || (!beforeWords.has("less") && afterWords.has("less"));
}

function changesLikelyNounNumber(before: string, after: string): boolean {
  const beforeWords = words(before);
  const beforeSet = new Set(beforeWords);
  const afterWords = words(after);
  const afterSet = new Set(afterWords);
  for (const [index, word] of beforeWords.entries()) {
    if (word.length < 3) continue;
    const plural = word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`;
    if (beforeSet.has(plural) || !afterSet.has(plural)) continue;
    const next = beforeWords[index + 1];
    if (next === undefined || /^(?:are|is|was|were|has|have)$/.test(next)) return true;
  }
  return false;
}

export function classifyTransformation(before: string, after: string): RiskClassification {
  const signals: RiskSignal[] = [];
  if (JSON.stringify(extractSemanticInvariants(before)) !== JSON.stringify(extractSemanticInvariants(after))) {
    signals.push({ name: "semantic-invariant-change", risk: "high", detail: "A quantity, identifier, negation, or modality changed." });
  }
  if (changesComparisonDegree(before, after)) {
    signals.push({ name: "comparison-degree-change", risk: "high", detail: "An absolute term became comparative or superlative." });
  }
  if (changesLikelyNounNumber(before, after)) {
    signals.push({ name: "grammatical-number-change", risk: "high", detail: "A likely noun changed from singular to plural." });
  }
  if (hasNewRepeatedPunctuation(before, after)) {
    signals.push({ name: "malformed-punctuation", risk: "high", detail: "The candidate introduced repeated punctuation." });
  }
  if (adversarialPattern.test(before)) {
    signals.push({ name: "embedded-instruction-language", risk: "high", detail: "The input contains language associated with correction-contract attacks." });
  }
  for (const [name, pattern] of ambiguityPatterns) {
    if (pattern.test(before)) signals.push({ name: `ambiguity:${name}`, risk: "unknown", detail: "The input contains an unresolved scope, reference, or relative target." });
  }

  const risk: Risk = signals.some((signal) => signal.risk === "high")
    ? "high"
    : signals.some((signal) => signal.risk === "unknown") ? "unknown" : "low";
  return { risk, reasons: signals.length === 0 ? ["surface-edit-only"] : signals.map((signal) => signal.name), signals };
}
