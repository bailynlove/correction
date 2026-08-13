# Bound correction latency and fail open

Status: accepted

Date: 2026-08-13

Correction v0.1 gives each English-correction processor a default warm deadline
of 1,800 ms inside a 2,000 ms pipeline budget. If correction does not finish in
time, the pipeline preserves the immutable original prompt and proceeds to the
configured review flow with a visible timeout reason. A timeout never produces
or partially applies a candidate.

The latency acceptance gate measures the complete prompt-processing outcome,
including timed-out requests, rather than only successful model generations.
Warm p95 must remain at or below two seconds. Correction coverage is a separate
metric and must be reported overall and by prompt-length band; a fast timeout is
not counted as a successful correction.

This contract is preferred to a length threshold because the frozen corpus has
no evidence between 249 and 656 characters. It is preferred to relaxing the
latency target because predictable interactivity is part of the product, and to
blocking the prototype on another model search because the original prompt is a
safe, useful fail-open result.

The evaluated Qwen3.5 9B MLX full-text path remains the quality reference. In
the frozen holdout, 225 of 300 runs completed within 1,800 ms and their p95 was
1,248 ms; all 75 slower runs were 657–782 characters. Those measurements inform
the contract but do not establish a permanent character cutoff.
