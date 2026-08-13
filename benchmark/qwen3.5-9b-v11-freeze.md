# Qwen3.5 9B v11 holdout freeze

Date: 2026-08-12

## Frozen candidate

The development gates select the following immutable candidate for the one-time
holdout evaluation:

- model: `mlx-community/Qwen3.5-9B-MLX-4bit`;
- model revision: `938d8919941c6e7efd3c7150eff7fe9d12afa631`;
- runtime: MLX-LM 0.31.3 with MLX 0.32.0;
- prompt template: version 11;
- context: 4,096 tokens;
- maximum output: 256 tokens;
- temperature: 0;
- thinking: disabled;
- concurrency: one; and
- request timeout: 15 seconds.

The frozen processor sources have these Git object hashes:

| Source | Hash |
| --- | --- |
| `english-correction.ts` | `9a8399d4f924596fbdf357568da502d575a2d681` |
| `protected-spans.ts` | `6f10fc96fdc18fde52e8264f847b03cce7bb085b` |
| `semantic-invariants.ts` | `02765cb7c7138747dbe98d80aea584bb90190274` |
| `template.ts` | `fc1c256ba2891c342c328ffc1369ebf2bad91f04` |

No prompt, projection, invariant, model, runtime, or generation-setting change is
permitted after the holdout is opened. A holdout failure is reported as such; it
must not be tuned against this holdout.

## Development evidence

The five-run automated result is in
`benchmark/results/development-qwen3.5-9b-projection-v11-5run/`:

- 700/700 curated requests completed without processor errors;
- 1,000/1,000 generated protected-span cases completed without errors;
- zero unchanged-case violations;
- all five outputs were byte-identical for every one of the 140 curated cases;
- 530/700 outputs exactly matched a configured reference;
- warm p50 was 600.205 ms and warm p95 was 1,529.278 ms; and
- the measured warmup/cold request was 1,312.627 ms.

The automated hard gates and the two-second latency gate pass. The independent
human development reviews are recorded in
`benchmark/review/development-qwen3.5-9b-projection-v11-delta/review-comparison.md`;
both reviewers found zero fidelity failures and zero adversarial-contract
failures across the combined 140-case result.

## Holdout protocol

Run all 60 holdout cases five times in the seeded random order, plus the complete
1,000-case generated protected-span suite, using the frozen settings above. Then
prepare a new blinded packet and obtain two independent reviews before inspecting
its private mapping. Holdout results are never used to revise this candidate.
