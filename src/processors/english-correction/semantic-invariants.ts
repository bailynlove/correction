interface Invariants {
  readonly quantities: readonly string[];
  readonly identifiers: readonly string[];
  readonly negationCount: number;
  readonly modalities: readonly string[];
}

const quantityPattern = /\bv?\d+(?:\.\d+){0,3}(?:-[a-zA-Z0-9.-]+)?(?:\s*(?:ms|milliseconds?|s|seconds?|m|minutes?|h|hours?|kb|kilobytes?|mb|megabytes?|gb|gigabytes?|%|px|pixels?))?\b/gi;
const identifierPattern = /\b(?:[A-Z][A-Z0-9_]{2,}|[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+)\b/g;
const negationPattern = /\b(?:not|never|no|without|cannot|[a-z]+n['’]t)\b/gi;
const modalityPattern = /\b(?:must|shall|should|may|might|can|required|optional)\b/gi;

function sortedMatches(input: string, pattern: RegExp): string[] {
  pattern.lastIndex = 0;
  return [...input.matchAll(pattern)].map((match) => match[0].toLowerCase()).sort();
}

function quantities(input: string): string[] {
  const unitAliases: ReadonlyArray<readonly [RegExp, string]> = [
    [/milliseconds?$/, "ms"], [/seconds?$/, "s"], [/minutes?$/, "m"], [/hours?$/, "h"],
    [/kilobytes?$/, "kb"], [/megabytes?$/, "mb"], [/gigabytes?$/, "gb"], [/pixels?$/, "px"],
  ];
  quantityPattern.lastIndex = 0;
  return [...input.matchAll(quantityPattern)]
    .map((match) => {
      let value = match[0].toLowerCase().replaceAll(/\s/g, "");
      for (const [alias, canonical] of unitAliases) value = value.replace(alias, canonical);
      return value;
    })
    .sort();
}

function identifiers(input: string): string[] {
  const units = new Set(["MS", "S", "M", "H", "KB", "MB", "GB", "PX"]);
  identifierPattern.lastIndex = 0;
  return [...input.matchAll(identifierPattern)]
    .map((match) => match[0])
    .filter((value) => !units.has(value))
    .sort();
}

export function extractSemanticInvariants(input: string): Invariants {
  return {
    quantities: quantities(input),
    identifiers: identifiers(input),
    negationCount: sortedMatches(input, negationPattern).length,
    modalities: sortedMatches(input, modalityPattern),
  };
}

export function assertSemanticInvariantsPreserved(before: string, after: string): void {
  const expected = extractSemanticInvariants(before);
  const actual = extractSemanticInvariants(after);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error("semantic invariant mismatch");
  }
}
