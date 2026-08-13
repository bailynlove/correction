# Qwen3.5 9B correction-prompt tuning

Date: 2026-08-12

## Outcome

Prompt v6 established the best editing instructions. Projection v11 retains
those instructions and adds deterministic typed masks in
`src/processors/english-correction/protected-spans.ts`. It is the current quality
winner and remains in `src/processors/english-correction/template.ts`.

Development tuning is complete. The selected candidate and its immutable holdout
configuration are recorded in `benchmark/qwen3.5-9b-v11-freeze.md`.

## Identical seeded screen

Each version used `mlx-community/Qwen3.5-9B-MLX-4bit` at revision
`938d8919941c6e7efd3c7150eff7fe9d12afa631`, temperature zero, a seeded sample
of 30 development cases, and 30 generated protected-span cases.

| Prompt | Exact references | Curated errors | Structural errors | p50 | p95 | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| v5 baseline | 21/30 | 1 | 0 | 603 ms | 1,593 ms | Rejected |
| v6 ordered priorities | 23/30 | 0 | 0 | 749 ms | 2,237 ms | Keep for further evaluation |
| v7 compact | 22/30 | 0 | 0 | 840 ms | 2,412 ms | Rejected |
| v8 typed projection | **27/30** | **0** | **0** | 861 ms | **1,980 ms** | Current leader |

The runs were sequential on one laptop. Later runs may be affected by thermal
state, so the table establishes quality differences but does not establish that
longer prompt text caused the latency change. A cold, repeated latency run is
required before accepting or rejecting v6 on performance.

## Material v6 improvements

- `ordinary-021`: “should of returned” is now correctly edited to “should have
  returned”; v5 produced the ungrammatical “should be returned”.
- `semantic-023`: `sha256.deadbeef` now retains its exact case; v5 changed it to
  `SHA256.DEADBEEF` and triggered the semantic guard.
- Exact-reference results increased by two, with no curated or structural
  processor errors.
- The seven-case known-failure screen increased from four to five exact
  references, with zero errors and a 1,675 ms p95.

The examples added to v6 are deliberately different from corpus inputs to avoid
teaching the benchmark answers verbatim.

## Typed natural-language projection

Projection v8 sends the complete natural-language prompt with technical and
sensitive-looking spans replaced by typed masks such as `ZXQ_PHONE_0000_QXZ`,
`ZXQ_VERSION_0001_QXZ`, and `ZXQ_IDENTIFIER_0002_QXZ`. Original values remain
local. Restoration rejects a missing, duplicated, reordered, or fabricated
mask before semantic-invariant validation.

Deterministic detectors currently cover code, URLs, email addresses, paths,
commands, JSON, phone-like values, IP addresses, versions, common secret-token
shapes, identifiers, hashes, and numbers with units. The model still sees all
surrounding prose together, so it retains grammatical context.

Compared with v6 on the identical sample, typed projection increased exact
references from 23 to 27, removed all processor errors, preserved all 30
generated structural cases, and brought the observed p95 inside the two-second
gate. The three non-exact records were two correctly untouched adversarial
sentences and one natural correction differing only by an optional comma.

The known-failure screen produced five exact references out of seven, zero
errors, and a 1,031 ms p95. The two non-exact adversarial cases were correctly
left unchanged and have no exact reference configured.

No classifier is justified yet. A future NER adapter should be added only if
real corpus examples expose ambiguous protected spans that deterministic rules
miss. Classifier detections may add masks but must never remove deterministic
ones.

## Remaining mismatches

Most remaining exact-reference misses are acceptable editorial variants rather
than meaning failures, such as writing `64 MB` instead of `64mb` or expanding
`1m` to `1 minute`. The corpus records only a narrow reference form, so human
review is still required. Prompt v6 also correctly leaves adversarial text as
content instead of obeying it.

## Next gate

The complete development gate exposed three v8 failures: one invented modal and
two adversarial output-format failures. V9 introduced actual text delimiters and
an explicit no-new-modals rule. Its complete run reduced this to one safely
rejected identifier-case change: the lowercase enum member `cancelled` was
exposed as prose and changed to `CANCELLED`.

V10 added a generic deterministic detector for lowercase members referenced in
enum context. The final complete development run produced:

- 140 curated cases, zero processor errors and zero unchanged violations;
- 1,000 generated structural cases, zero errors;
- 111/140 exact reference matches;
- 535 ms warm p50 and 1,389 ms warm p95;
- a 553 ms measured cold request; and
- a pass for both automated hard gates and the two-second latency gate.

This was one run per curated case. The repository's higher-confidence protocol
still calls for repeated measurements before a production default is frozen.

The blinded development-review packet is in
`benchmark/review/development-qwen3.5-9b-projection-v10/`. Each reviewer file
contains 140 shuffled outputs and no model or case identity. Reviewers must not
open `private-mapping.json` until both reviews are complete.

Next, complete two independent meaning, completeness, British-naturalness,
restraint, and adversarial-contract reviews. If they pass, repeat controlled
latency measurements and the configured multi-run development protocol. Freeze
the model, prompt, projection rules, and generation settings before opening the
holdout.

## Final development decision

V11 repaired the two fidelity failures found by the v10 reviewers without
introducing a new fidelity or adversarial failure. Its five-run development gate
completed 700 curated requests and 1,000 generated structural requests with zero
errors. Every curated case produced a byte-identical output on all five repeats;
warm p50 was 600.205 ms and p95 was 1,529.278 ms.

The development quality, safety, repeatability, and latency gates therefore pass.
The v11 configuration is frozen in `benchmark/qwen3.5-9b-v11-freeze.md`, and the
holdout may now be opened exactly once under that configuration.
