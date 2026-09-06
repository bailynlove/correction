# Correction

Correction is a local-first prompt pipeline for coding agents. It processes a
user prompt before the host agent sees it, preserving technical content while a
configurable processor corrects natural-language text or performs another
policy check.

The current prototype provides a British-English correction pipeline and a Pi
extension that keeps Pi's native terminal interface. Codex keeps its native TUI
too, but its package intentionally does not rewrite prompts because Codex hooks
do not expose prompt replacement.

> [!IMPORTANT]
> This repository is an experimental prototype, not a production release. No
> evaluated local model currently passes every frozen quality and latency gate.

## What works

- British-English correction through separately installed Ollama or MLX-LM
  runtimes.
- Exact masking and restoration of code, paths, URLs, commands, identifiers,
  numbers, secrets, and other protected spans.
- Approve, edit, bypass, and cancel interaction inside Pi's native TUI.
- `always`, experimental `risky`, and `never` approval policies.
- Configurable fail-open or fail-closed processor errors.
- Strict user and repository TOML layering plus a safe approval-mode CLI
  override, designed around explicit trust boundaries.
- Content-free JSONL diagnostics by default.
- A Pi input extension that preserves commands, skills, templates, images,
  history, and the rest of Pi's interaction lifecycle.
- A retained Codex App Server reference prototype for protocol diagnostics.

## How it fits together

```text
Pi TUI input → protected-span projection → configured processors → Pi review
    │                                                               │
    └──────── commands, skills, and templates stay in Pi ───────────┘

Codex TUI input → unchanged Codex lifecycle (English correction inactive)
```

The pipeline and processor contracts are host-neutral. Pi is the first
transforming host adapter. The Codex package is deliberately non-transforming;
Kimi CLI remains future work.

## Requirements

- macOS on Apple Silicon for the evaluated MLX path.
- Node.js 24.
- Pi `0.82.1` for the transforming extension.
- Codex CLI `0.147.0` only for the retained App Server reference prototype.
- A separately installed local model runtime for real correction:
  [Ollama](https://ollama.com/) or [MLX-LM](https://github.com/ml-explore/mlx-lm).

Correction does not download or manage model weights automatically.

## Quick start

Install dependencies, start the configured local runtime, and launch Pi with
the Correction extension:

```sh
npm ci
npm run plugin:pi
```

At the prompt, try:

```text
Can you helps me change color in `src/app.ts`?
```

Pi keeps its normal composer and commands. When ordinary input produces a
candidate, a Pi-native review dialog offers approve, edit, bypass, or cancel.
The inline path remains unchanged.

The built-in configuration expects Ollama at `http://127.0.0.1:11434` with
`qwen3.5:2b`. Configure the evaluated MLX model as shown below when using the
quality-reference path.

Pi package discovery is also declared in `package.json`, so a published or
Git-installed checkout can load `src/integrations/pi-extension.ts` as an
extension.

The old deterministic and real Codex clients remain available for diagnostics:

```sh
npm run prototype:codex:demo
npm run prototype:codex
```

Resume an existing Codex thread or select an explicit configuration file:

```sh
npm run prototype:codex -- --resume THREAD_ID
npm run prototype:codex -- --config /absolute/path/config.toml
```

These clients replace the Codex TUI and are no longer the recommended way to
use Correction. Type `:quit` to close them.

## Configuration

The configuration design has this precedence:

1. built-in safe defaults;
2. `~/.config/correction/config.toml`;
3. `<git-root>/.correction.toml`;
4. safe command-line overrides;
5. per-message overrides.

The prototype implements built-ins, user and repository files, explicit
`--config`, and the `--approval` CLI override. General CLI and per-message
overrides remain planned work.

Arrays replace earlier arrays. Unknown keys and invalid types are rejected.
Supplying `--config` disables automatic user and repository discovery.

The built-in prototype configuration expects Ollama at
`http://127.0.0.1:11434` with `qwen3.5:2b`. That model is convenient for trying
the pipeline but is not an accepted production default.

Example user configuration for the evaluated MLX quality reference:

```toml
config_version = 1

[pipeline]
processors = ["british-english"]
timeout = "2s"

[approval]
mode = "always"
max_review_cycles = 3

[runtimes.local-mlx]
kind = "mlx"
endpoint = "http://127.0.0.1:18080"
keep_alive = "5m"

[processors.british-english]
enabled = true
kind = "english-correction"
runtime = "local-mlx"
model = "mlx-community/Qwen3.5-9B-MLX-4bit"
on_error = "continue"
timeout = "1800ms"

[processors.british-english.options]
locale = "en-GB"
context_tokens = 4096
max_output_tokens = 512
temperature = 0

[hosts.codex]
kind = "codex-app-server"
command = ["codex", "app-server"]

[diagnostics]
level = "warn"
sink = "stderr"
format = "jsonl"
content = false
```

Repository configuration cannot change model endpoints, host commands,
processor prompts, or content logging. It may strengthen approval and error
policies but cannot weaken user-level trust settings.

## Approval modes

- `always` reviews every prompt, even when the processor returns it unchanged.
- `risky` reviews transformations classified as high or unknown risk. The
  classifier is not calibrated for production, so this mode is experimental.
- `never` sends the candidate without an approval prompt.

Bypass restores the original prompt for the current pipeline attempt. Cancel
sends nothing. An edit begins a new attempt and is processed again, with a
configurable maximum number of review cycles. Processor blocks cannot be
bypassed.

## Safety and privacy

The correction processor sends a complete natural-language projection to the
local runtime. Protected spans are replaced with typed opaque masks, restored
locally, and checked for identity and ordering. Semantic invariants reject
changes to protected quantities, identifiers, negation, modality, and related
meaning-bearing structures.

When the correction runtime fails or exceeds its timeout, the default
`on_error = "continue"` policy preserves the original prompt and continues to
review. Security processors can instead use `on_error = "block"`.

Default diagnostics contain timestamps, outcomes, timings, lengths, and a short
content hash for correlation. Prompt text is included only when content logging
is explicitly enabled in trusted user configuration.

## Model status

The strongest evaluated candidate is
`mlx-community/Qwen3.5-9B-MLX-4bit`. It passed the frozen correctness,
protected-span, adversarial, repeatability, and human-quality gates. It did not
pass the all-prompt warm-latency gate: holdout p95 was 2.963 seconds, driven by
long 600–780 character prompts.

A sparse-edit experiment was rejected because it introduced two
British-to-American changes on already-correct development prompts and still
recorded a 2.511-second development p95. The holdout was not exposed after that
development failure.

v0.1 uses bounded fail-open: English correction receives a default 1.8-second
deadline inside the two-second pipeline budget. A timeout preserves the original
prompt and continues to review with an explicit reason. Deadline compliance and
correction coverage are reported separately; a timed-out prompt does not count
as successfully corrected. See
[`docs/adr/0003-bounded-fail-open-latency.md`](docs/adr/0003-bounded-fail-open-latency.md).

The frozen five-run holdout validation recorded 1.802-second outcome p95,
200/300 completed processor checks, 100/300 bounded timeouts, and zero late
candidate violations. See
[`benchmark/bounded-fail-open-validation.md`](benchmark/bounded-fail-open-validation.md).

## Development

```sh
npm run build
npm test
npm run benchmark -- --runtime ollama --models qwen3.5:2b --limit 5 --runs 1 --structural-limit 10
npm run prototype:risky
npm run plugin:pi
npm run prototype:codex:demo
```

Important locations:

- `src/processors/english-correction/` — correction, prompt template, masking,
  and semantic checks.
- `src/integrations/pi-extension.ts` — Pi-native transforming host adapter.
- `src/vertical-slice/` — configuration, mediation, pipeline, and retained Codex
  reference adapter.
- `plugins/correction/` — non-transforming Codex plugin package and capability
  boundary.
- `src/benchmark/` — frozen corpus and benchmark runner.
- `benchmark/` — recorded evidence and decision reports.
- `docs/adr/` — architectural decisions.
- `docs/research/` — primary-source investigations.
- `CONTEXT.md` — domain language and invariants.

The Codex adapter protocol pin and regeneration commands are documented in
[`docs/protocol/codex-app-server-0.147.0.md`](docs/protocol/codex-app-server-0.147.0.md).

## Known prototype limitations

- English correction is unavailable in the native Codex TUI because
  `UserPromptSubmit` cannot replace prompts.
- The Pi integration requires dialog-capable TUI or RPC mode. It preserves
  prompts unchanged in print and JSON modes.
- The retained Codex client accepts line-oriented text only, does not support
  multimodal prompts, and does not forward user-input requests or MCP
  elicitation.
- Generated Codex protocol bindings are not committed; the reference adapter
  uses a documented narrow protocol snapshot.
- `never` mode does not yet render a non-blocking diff before submission.
- There is no installer, packaged executable, auto-update, or bundled runtime.

Project decisions and remaining work are tracked in the
[Correction v0.1 wayfinding map](https://github.com/bailynlove/correction/issues/1).
