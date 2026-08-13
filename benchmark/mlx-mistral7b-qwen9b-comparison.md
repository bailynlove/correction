# MLX Mistral 7B vs Qwen3.5 9B screen

Date: 2026-08-12

## Decision

Retain `mlx-community/Qwen3.5-9B-MLX-4bit` as the only candidate for
prompt/policy tuning. It is the strongest local model tested so far, but it is
not accepted for the Correction default: one of 30 development requests hit a
semantic-invariant error and one known grammar case was corrected incorrectly.

Reject and remove `mlx-community/Mistral-7B-Instruct-v0.3-8bit`. It failed the
structured-output contract on every request and was far too slow for an
interactive pre-flight pipeline.

The holdout corpus remains unopened because neither model cleared the
development hard gates.

## Reproducibility

- Host: Apple M5 Pro, 48 GiB unified memory, macOS 25.5.0
- Runtime: MLX 0.32.0, MLX-LM 0.31.3
- Generation: temperature 0, maximum 256 output tokens, 4,096-token context
- Screen: seeded 30-case development sample, one run, plus 30 generated
  protected-span cases
- Gate: zero errors, zero unchanged/protected violations, and warm p95 no more
  than 2 seconds

### Mistral

- Repository: `mlx-community/Mistral-7B-Instruct-v0.3-8bit`
- Revision: `c282bcd11a64be44ac3f130f0b819d48ecc1846d`
- Download size: 7.7 GB
- Licence/access: Apache-2.0, public and ungated
- Compatibility: its bundled template rejects system messages. The benchmark
  used `benchmark/templates/mistral-v0.3-system.jinja` to place the system
  instruction inside the first `[INST]` turn.

Result:

- Curated errors: 30/30
- Structural errors: 30/30
- Cold start: invalid JSON
- Warm latency: approximately 8–11 seconds per observed server response; the
  runner cannot calculate percentiles because every processor result was an
  error
- Failure mode: Markdown-like output beginning with a code fence rather than
  the required JSON object
- Cache status: deleted after rejection, recovering 7.7 GB

Raw evidence is in
`benchmark/mlx-mistral-7b-instruct-v0.3-8bit-screen/`.

### Qwen3.5

- Repository: `mlx-community/Qwen3.5-9B-MLX-4bit`
- Revision: `938d8919941c6e7efd3c7150eff7fe9d12afa631`
- Download size: 6.0 GB
- Licence/access: Apache-2.0, public and ungated
- Runtime option: `enable_thinking=false`

Development screen result:

- Cold start: 1,075 ms
- Warm p50: 603 ms
- Warm p95: 1,593 ms
- Exact reference matches: 21/30
- Curated errors: 1/30
- Structural errors: 0/30
- Unchanged violations: 0
- Automated hard gates: failed because the model changed
  `sha256.deadbeef` to `SHA256.DEADBEEF`; the semantic guard rejected the
  candidate and safely retained the original prompt

Manual findings:

- Correctly produced British forms such as `colour`, `centre-aligned`,
  `organise`, and `recognises`.
- Preserved URLs, paths, shell commands, identifiers, negation, quantities, and
  adversarial instructions in the screened examples.
- Passed the seven-case known-failure screen structurally at 741 ms p50 and
  1,508 ms p95.
- Still changed “should of returned” to the ungrammatical “should be returned”
  instead of “should have returned”.
- Sometimes under-corrected otherwise safe prose, for example leaving
  “the worker must wait 250ms” unchanged.

Raw evidence is in `benchmark/mlx-qwen3.5-9b-4bit-screen/` and
`benchmark/mlx-qwen3.5-9b-4bit-known-failures/`.

## Next experiment

Before trying a larger checkpoint, tune the correction prompt and protected
identifier policy against Qwen3.5 9B, then rerun this development screen. The
model is already within the interactive latency budget and its remaining
failures are narrow enough to test whether policy changes can fix them. Only
open the holdout set after a zero-error development run.
