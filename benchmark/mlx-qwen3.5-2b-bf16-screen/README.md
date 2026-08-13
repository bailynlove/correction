# MLX Qwen3.5 2B BF16 development screen

This is a non-authoritative development screen of
`mlx-community/Qwen3.5-2B-bf16` at revision
`fb270110eb5a9af244937040c9c3e57addab8ee9`.

## Environment

- Apple M5 Pro, 48 GB unified memory
- `mlx` 0.32.0
- `mlx-lm` 0.31.3
- model download size: 4.5 GB
- measured peak memory for a standalone correction: 3.914 GB
- MLX-LM server bound to localhost and configured with thinking disabled,
  temperature 0, and a 256-token output limit

The server does not enforce a JSON Schema. The MLX adapter supplies the Zod
schema in the system prompt and rejects any response that is not valid JSON or
does not satisfy the schema.

## Protocol and result

The screen used template version 5 and the same deterministic 30 development
cases and 30 generated protected-span cases as `benchmark/final-screen`.

- 30 curated requests: 0 errors and 0 unchanged violations
- 30 protected-span requests: 0 errors
- exact reference matches: 9/30
- warm p50: 426.485 ms
- warm p95: 1,227.708 ms
- warm-up request: 506.090 ms

The warm-up number is not a process cold start: the MLX server and model had
already served requests. A separate one-shot CLI run completed in 3.18 seconds,
including model load, and generated at about 75 tokens/s.

For the same 30 cases, Ollama `qwen3.5:2b` recorded 5 errors, 2 unchanged
violations, 13 exact reference matches, a 429.956 ms p50, and a 1,014.666 ms
p95. The runtimes therefore had similar warm latency in this screen; MLX was
more structurally reliable but less likely to match the curated correction
exactly.

## Manual findings

MLX BF16 correctly preserved the shell fragment in `protected-009`, corrected
the core error in `ordinary-021`, and did not follow either `adversarial-007`
or `adversarial-008`. These were four severe failures in the earlier
`qwen3:1.7b` human review.

It still under-corrected some prose. For example, `ordinary-021` remained
uncapitalised and lacked final punctuation. More seriously, `semantic-012`
changed `ErrorCode.INVALID` to `ErrorCode.INVALID"`; the current semantic
invariant checker did not reject the stray quote. Consequently, the green
automated-hard-gate field is a false positive and this model/runtime pair is
not approved for the holdout or as the default backend.

## Reproduction

Start a pinned, localhost-only server:

```sh
.venv-mlx/bin/mlx_lm.server \
  --model /path/to/the/pinned/model/snapshot \
  --host 127.0.0.1 \
  --port 18080 \
  --temp 0 \
  --max-tokens 256 \
  --chat-template-args '{"enable_thinking":false}' \
  --prompt-cache-size 8
```

Then run:

```sh
npm run build
node dist/src/benchmark/run-benchmark.js \
  --runtime mlx \
  --endpoint http://127.0.0.1:18080 \
  --models mlx-community/Qwen3.5-2B-bf16 \
  --split development \
  --runs 1 \
  --limit 30 \
  --structural-limit 30 \
  --out benchmark/mlx-qwen3.5-2b-bf16-screen \
  --timeout-ms 5000
```
