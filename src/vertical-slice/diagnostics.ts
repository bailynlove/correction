import { createHash } from "node:crypto";

import type { ProcessorTrace } from "./pipeline.js";

export type DiagnosticLevel = "error" | "warn" | "info" | "debug";

const PRIORITY: Record<DiagnosticLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export function diagnostic(
  configuredLevel: DiagnosticLevel,
  level: DiagnosticLevel,
  event: string,
  fields: Record<string, unknown>,
): void {
  if (PRIORITY[level] > PRIORITY[configuredLevel]) return;
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields })}\n`);
}

export function promptMetadata(text: string, includeContent = false): Record<string, unknown> {
  return {
    content_sha256_12: createHash("sha256").update(text).digest("hex").slice(0, 12),
    chars: text.length,
    lines: text.split("\n").length,
    ...(includeContent ? { content: text } : {}),
  };
}

export function traceMetadata(traces: readonly ProcessorTrace[]): Record<string, unknown> {
  return {
    processors: traces.map(({ processor, result, durationMs, code }) => ({
      processor,
      result,
      duration_ms: Number(durationMs.toFixed(1)),
      ...(code === undefined ? {} : { code }),
    })),
  };
}
