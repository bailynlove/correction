# MLX candidate comparison

Date: 2026-08-12

Hardware: Apple M5 Pro with 48 GB unified memory.

Runtime versions:

- `mlx` 0.32.0
- `mlx-lm` 0.31.3
- `mlx-vlm` 0.6.12

Only the two pinned candidate checkpoints remain in the Hugging Face cache.
The Ollama model inventory is empty.

## Qwen3.5 4B MXFP8

- repository: `mlx-community/Qwen3.5-4B-mxfp8`
- revision: `a34dd69c7f165c0db75d71061e1bd8f4aeb9eead`
- cache size: 5.0 GB
- runtime: MLX-LM
- standalone peak memory: 4.599 GB
- standalone generation throughput: about 63 tokens/s

Deterministic template-5 development screen:

- curated cases: 30
- generated protected-span cases: 30
- schema/request errors: 0
- protected-span errors: 0
- exact reference matches: 14/30
- warm p50: 565.121 ms
- warm p95: 1,424.523 ms
- first request after server start: 1,173.322 ms
- unchanged violations: 1

The model corrected all five targeted regression cases, including the shell
fragment, the two adversarial instructions, `ordinary-021`, and the earlier
`semantic-012` stray-quote failure.

It nevertheless fails the safety/meaning gate:

- `Use a serialisable value for the cache key.` became
  `Use a serialise value for the cache key.`
- `can you optimise this color picker` became
  `Can you organise this colour picker?`, changing the requested action.

Decision: rejected as the default correction model. Do not open the holdout.

Raw results:

- `benchmark/mlx-qwen3.5-4b-mxfp8-screen/`
- `benchmark/mlx-qwen3.5-4b-mxfp8-known-failures/`

## Gemma 3n E4B 8-bit

- repository: `mlx-community/gemma-3n-E4B-8bit`
- revision: `fd068bc07125a74efdc5146938f84c4dd0e77ba3`
- cache size: 9.3 GB
- licence tag: `gemma`
- required runtime: MLX-VLM
- standalone peak memory with MLX-VLM 0.6.12: 9.427 GB
- standalone generation throughput: about 45 tokens/s

This checkpoint is not benchmarkable as an instruction-following correction
model:

1. MLX-LM recognises `gemma3n` but fails to load the converted weights with
   `KeyError: 'model'`.
2. MLX-VLM 0.6.12 loads the model, but both the HTTP server and direct CLI
   produce degenerate repetitions instead of a correction.
3. The exact conversion runtime named by the model card, MLX-VLM 0.3.1, fails
   because the checkpoint's processor has no chat template.

The generated `benchmark/mlx-gemma-3n-e4b-8bit-screen/` results contain HTTP
422 responses from the first MLX-VLM API-shape attempt and are diagnostic only;
they are not a model-quality benchmark.

Decision: incompatible with the Correction processor. Do not open the holdout.
