# Bounded fail-open validation

Date: 2026-08-13

Ticket: #13

Model: `mlx-community/Qwen3.5-9B-MLX-4bit`

Runtime: MLX-LM `0.31.3`, local HTTP server

Decision: accept the bounded fail-open implementation

## Contract

English correction receives 1,800 ms inside a 2,000 ms pipeline budget. A
processor timeout wins a deadline race even when the processor ignores
cancellation. No partial or late candidate is applied. Fail-open preserves the
current candidate and adds a visible timeout notice; fail-closed returns a
failed pipeline outcome.

The latency gate measures complete pipeline outcomes, including timeouts.
Processor completion and transformation coverage are separate metrics.

## Deterministic validation

The test suite covers:

- fail-open processor timeout and immutable-original preservation;
- ignored cancellation and discarded late transformation;
- fail-closed timeout policy;
- independent pipeline deadline;
- generic processor error versus timeout classification;
- cancellation after timeout sending no host turn; and
- approval after timeout sending only the preserved original.

All 23 repository tests passed.

## Frozen holdout validation

The existing Qwen3.5 9B prompt, schema, model snapshot, 60-case holdout, shuffle
seed, and five-run schedule were unchanged. The new pipeline deadline wrapped
the full-text processor. The run produced 300 complete outcomes.

| Metric | Result |
| --- | ---: |
| Outcome p95 | 1,801.9 ms |
| Maximum outcome | 1,802.3 ms |
| Processor completed | 200/300 (66.7%) |
| Processor transformed | 113/300 (37.7%) |
| Timed out | 100/300 (33.3%) |
| Late-candidate violations | 0 |
| Failed or blocked outcomes | 0 |

Coverage by prompt length:

| Characters | Requests | Completed | Transformed | Timed out | Outcome p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0–249 | 225 | 200 (88.9%) | 113 (50.2%) | 25 (11.1%) | 1,801.4 ms |
| 250–499 | 0 | — | — | — | — |
| 500–649 | 0 | — | — | — | — |
| 650+ | 75 | 0 | 0 | 75 (100%) | 1,802.2 ms |

All 100 timed-out outcomes preserved the original. Among the 200 completed
processor checks, 158 matched a curated acceptable result and no completed
unchanged case violated its reference. This report does not reinterpret a
timeout as a quality pass: it is a safe, bounded no-correction outcome.

The 25 short timeouts show that input length is not a reliable policy boundary;
runtime state and output work also matter. The deadline remains the contract,
and the missing 250–649 character bands remain an evidence gap rather than an
inferred success.

## Result

The implementation passes the ≤2-second warm outcome gate, prevents late
candidate use, exposes timeouts to review, and reports correction coverage
separately. Bounded fail-open is accepted for the v0.1 prototype.
