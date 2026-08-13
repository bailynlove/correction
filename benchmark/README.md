# Correction model benchmark

This benchmark implements the acceptance protocol resolved in GitHub issue 6.
The development split contains 140 curated cases; the locked holdout contains 60.
Each model also processes 1,000 generated protected-span cases end to end.

## Run

Prerequisites are Node 24, Ollama 0.32.8 or later, and the four model tags listed
below. Keep the machine otherwise idle during authoritative latency measurements.

```sh
ollama pull qwen3.5:2b
ollama pull qwen3:1.7b
ollama pull gemma3:1b
ollama pull granite3.3:2b
npm test
npm run benchmark -- --split development --runs 5 --out benchmark/results/development
```

The runner unloads each model, records one cold request, then keeps it resident for
randomised warm requests at concurrency one. Generation is deterministic with a
4K context, 256 output tokens, temperature zero, and thinking disabled. Every
request has a two-second timeout and no retry. JSONL files contain raw per-request
outputs and timings; summary files contain the automated gates. `environment.json`
records the host, model digests, runtime versions, seed, and complete profile.

`--limit` and `--structural-limit` exist only for smoke tests. Results produced with
either limit are not authoritative.

## Human review

After the automated gates, create packets only for candidates that remain eligible:

```sh
npm run benchmark:review -- \
  --results benchmark/results/development \
  --out benchmark/review/development
```

Two people independently complete `reviewer-a.csv` and `reviewer-b.csv`. They mark
meaning fidelity pass/fail; score completeness, British-English naturalness, and
restraint from 0–3; and assess the adversarial contract where applicable. They must
not inspect `private-mapping.json` until both reviews are complete. Disagreements
are adjudicated before calculating thresholds.

Do not open the holdout until the processor template, model shortlist, and generation
profile are frozen. Run it with `--split holdout`, then repeat blinded review.
