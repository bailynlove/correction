# Sparse-edit correction latency prototype

Date: 2026-08-13

Ticket: #11

Model: `mlx-community/Qwen3.5-9B-MLX-4bit`

Runtime: MLX-LM `0.31.3`, local HTTP server

Decision: reject sparse edits

## Question

Can validated sparse replacements reduce Qwen3.5 9B's output cost enough to
meet warm p95 ≤2 seconds without weakening any frozen correctness or safety
gate?

## Prototype

The isolated processor returns compact `[before, after]` tuples. It requires
each source to occur exactly once, rejects overlapping edits, requires an exact
protected-placeholder sequence on both sides, reconstructs edits from the end
of the prompt, restores protected spans, and then applies the same semantic
invariants as the full-text processor.

The frozen benchmark gained a `--processor full|sparse` switch; the full-text
implementation remains the default and control.

## Development results

| Revision | Curated | Structural | Errors | Unchanged violations | p95 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| v1 object schema screen | 12 | 20 | 29 | 0 | 1.383s among valid results | Reject: malformed JSON and unsafe edit spans |
| v2 tuple schema screen | 12 | 20 | 1 | 0 | 0.517s among valid results | Reject: under-corrected most prompts |
| v3 tuple prompt screen | 12 | 20 | 0 | 0 | 2.241s | Continue to full development set |
| v3 complete development | 140 | 100 | 0 | 2 | 2.511s | Reject |

The complete v3 run changed two already-correct British forms to American
spellings:

- `Optimise` → `Optimize` (`unchanged-011`)
- `serialisable` → `serializable` (`unchanged-013`)

Eight 225–252 character protected prompts exceeded two seconds. Median latency
was 0.682s, but the frozen gate is p95 and zero-tolerance safety. The existing
full-text control passed the complete development run with p95 1.529s and no
unchanged violations; its separately frozen holdout p95 remained 2.963s.

## Holdout discipline

No sparse-edit holdout run was performed. A proposed targeted rerun of known
slow full-text holdout cases was blocked because selecting cases after observing
holdout results would contaminate the frozen protocol. Sparse v3 then failed the
complete development gates, so there was no basis to expose the full holdout.

## Decision

Keep the full-text Qwen3.5 9B implementation as the quality reference and do not
adopt sparse edits. The experiment does not justify weakening fidelity or
latency criteria. Meeting both now requires a different model/runtime or a
product-scope decision, such as applying correction only below a documented
prompt-length boundary; changing the two-second gate itself requires an explicit
product decision rather than benchmark tuning.
