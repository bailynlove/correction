# ADR 0002: Derive change status from corrected text

- Status: accepted
- Date: 2026-08-11

## Context

The initial Ollama schema returned both `changed: boolean` and `correctedText:
string`. Screening all four shortlisted 1–2B models showed that the boolean was a
significant avoidable failure source: models often produced a usable correction but
reported `changed: false`. Repeated instructions, JSON Schema descriptions, and
few-shot examples did not make the duplicated state reliable enough for a
zero-tolerance gate.

The processor already possesses the masked input and must compare the restored model
output with its preceding candidate to produce the public `pass` or `transform`
result. The boolean therefore conveyed no independent information.

## Decision

The private structured-model response contains only `correctedText`. After restoring
protected spans, the English correction processor derives its public result by
byte comparison:

- identical output produces `pass`;
- different output is checked for semantic invariants and then produces `transform`;
- malformed output or a preservation violation produces `error` and retains the
  preceding candidate under the configured failure policy.

Content debugging remains disabled by default. The benchmark explicitly enables it
only for the public evaluation corpus so rejected model outputs can be diagnosed.

## Consequences

Inconsistent change metadata is impossible by construction and no longer needs a
runtime injection case. Schema-invalid, empty, truncated, and preservation-violating
responses remain required failure tests. The host-neutral processor and approval
contracts are unchanged.

On the authoritative development run, this schema allowed `qwen3:1.7b` to complete
700 curated requests and 1,000 generated protected-span requests with zero automated
hard-gate failures and warm p95 latency of 518.305 ms.
