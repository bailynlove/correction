# Sparse-edit latency prototype

This issue #11 experiment asks Qwen3.5 9B to return unique local
`[before, after]` replacements instead of regenerating the full corrected prompt.
The client rejects missing, ambiguous, overlapping, or placeholder-touching
edits unless the exact placeholder sequence is preserved, before reconstructing
and running the existing semantic invariants.

Run it through the frozen benchmark harness with:

```sh
npm run benchmark -- \
  --runtime mlx \
  --endpoint http://127.0.0.1:18080 \
  --models mlx-community/Qwen3.5-9B-MLX-4bit \
  --processor sparse \
  --split development \
  --runs 1 \
  --structural-limit 1000 \
  --timeout-ms 10000 \
  --out benchmark/results/development-qwen3.5-9b-sparse-v1
```

The full-text control remains `--processor full`.
