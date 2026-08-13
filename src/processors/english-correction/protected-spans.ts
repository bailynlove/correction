type ProtectedKind =
  | "CODE"
  | "URL"
  | "EMAIL"
  | "PATH"
  | "COMMAND"
  | "JSON"
  | "PHONE"
  | "IP"
  | "VERSION"
  | "SECRET"
  | "IDENTIFIER"
  | "NUMBER";

interface ProtectedSpan {
  readonly placeholder: string;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export interface PromptProjection {
  /** The complete prompt with protected spans replaced by typed masks. */
  readonly projectedText: string;

  /** Restores the original spans after validating mask identity and order. */
  restore(correctedText: string): string;
}

interface Detector {
  readonly kind: ProtectedKind;
  readonly pattern: RegExp;
}

const detectors: readonly Detector[] = [
  { kind: "CODE", pattern: /```[^\n]*\n[\s\S]*?```/g },
  { kind: "CODE", pattern: /~~~[^\n]*\n[\s\S]*?~~~/g },
  { kind: "CODE", pattern: /`[^`\n]+`/g },
  { kind: "URL", pattern: /https?:\/\/[^\s<>()]+/g },
  { kind: "EMAIL", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: "PHONE", pattern: /(?<![\w])\+?\d(?:[\d ()-]{5,}\d)(?![\w])/g },
  { kind: "IP", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { kind: "PATH", pattern: /(?:^|(?<=\s))(?:\.\.?\/|\/)[\w.@%+~/-]+/gm },
  {
    kind: "COMMAND",
    pattern: /\$\s+.*?(?=\s+(?:before|after|when|while|is|was|are|were|and|but)\b|[.,;!?](?:\s|$)|$)/gm,
  },
  { kind: "COMMAND", pattern: /(?:^|\n)\s*\$\s+[^\n]+/g },
  { kind: "COMMAND", pattern: /(?:^|(?<=\s))--?[a-zA-Z][\w-]*/gm },
  { kind: "COMMAND", pattern: /(?:^|(?<=\s))\/[a-zA-Z][\w-]*/gm },
  { kind: "IDENTIFIER", pattern: /@[a-zA-Z][\w-]*/g },
  { kind: "JSON", pattern: /\{(?:[^{}"']|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')+\}/g },
  { kind: "SECRET", pattern: /\b(?:sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/g },
  { kind: "VERSION", pattern: /\bv?\d+\.\d+(?:\.\d+)*(?:-[0-9A-Za-z.-]+)?\b/g },
  {
    kind: "IDENTIFIER",
    pattern: /\b[A-Za-z][\w-]*(?=\s+(?:to|from|in)\s+(?:the\s+)?(?:[A-Za-z][\w-]*\s+)?enum\b)/g,
  },
  { kind: "IDENTIFIER", pattern: /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/g },
  { kind: "IDENTIFIER", pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g },
  { kind: "IDENTIFIER", pattern: /\b(?:[a-z]+[A-Z][A-Za-z0-9]*|[A-Z][a-z]+(?:[A-Z][A-Za-z0-9]*)+)\b/g },
  { kind: "IDENTIFIER", pattern: /\b(?:sha(?:1|224|256|384|512)[.:_-])?[a-fA-F0-9]{8,}\b/g },
  { kind: "NUMBER", pattern: /(?<![\w])[-+]?\d[\d,_]*(?:\.\d+)?(?:%|[a-zA-Z]{1,8})?(?![\w])/g },
];

const placeholderPattern = /ZXQ_[A-Z]+_\d{4}_QXZ/g;

function collectSpans(input: string): ProtectedSpan[] {
  const matches: Array<{
    kind: ProtectedKind;
    start: number;
    end: number;
    value: string;
  }> = [];

  for (const detector of detectors) {
    detector.pattern.lastIndex = 0;
    for (const match of input.matchAll(detector.pattern)) {
      const start = match.index;
      if (start === undefined) continue;
      matches.push({
        kind: detector.kind,
        start,
        end: start + match[0].length,
        value: match[0],
      });
    }
  }

  matches.sort((left, right) => left.start - right.start || right.end - left.end);
  const nonOverlapping: typeof matches = [];
  for (const match of matches) {
    const previous = nonOverlapping.at(-1);
    if (previous === undefined || match.start >= previous.end) {
      nonOverlapping.push(match);
    }
  }

  return nonOverlapping.map((match, index) => ({
    ...match,
    placeholder: `ZXQ_${match.kind}_${index.toString().padStart(4, "0")}_QXZ`,
  }));
}

function restoreProjection(correctedText: string, spans: readonly ProtectedSpan[]): string {
  let cursor = 0;
  for (const span of spans) {
    const index = correctedText.indexOf(span.placeholder, cursor);
    if (
      index < 0
      || correctedText.indexOf(span.placeholder, index + span.placeholder.length) >= 0
    ) {
      throw new Error(`protected placeholder ${span.placeholder} was changed or duplicated`);
    }
    cursor = index + span.placeholder.length;
  }

  const seen = correctedText.match(placeholderPattern) ?? [];
  if (seen.length !== spans.length) {
    throw new Error("protected placeholder count changed");
  }

  let restored = correctedText;
  for (const span of spans) {
    restored = restored.replace(span.placeholder, span.value);
  }
  return restored;
}

/**
 * Produces one natural-language projection of the complete prompt. Technical
 * and sensitive-looking spans stay local and are represented by typed masks.
 */
export function projectPrompt(input: string): PromptProjection {
  const spans = collectSpans(input);
  let cursor = 0;
  let projectedText = "";
  for (const span of spans) {
    projectedText += input.slice(cursor, span.start);
    projectedText += span.placeholder;
    cursor = span.end;
  }
  projectedText += input.slice(cursor);

  return {
    projectedText,
    restore: (correctedText: string) => restoreProjection(correctedText, spans),
  };
}
