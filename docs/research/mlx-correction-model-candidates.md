# MLX correction model candidates

Date: 2026-08-12

## Question

Which current Hugging Face models are plausible next candidates for a local,
conservative British-English prompt corrector on an Apple M5 Pro with 48 GB of
unified memory?

## Recommendation

Benchmark these three first, in this order:

1. **`mlx-community/Qwen3.5-9B-MLX-4bit`** — the best first experiment. It is
   the smallest material step up from the failed 4B model, while the source
   model has substantially stronger manufacturer-reported instruction-following
   results. The current repository is public and ungated, Apache-2.0, has a
   usable system/user chat template, and contains about **5.95 GB** of weight
   shards. Pin revision `938d8919941c6e7efd3c7150eff7fe9d12afa631`.
2. **`mlx-community/phi-4-4bit`** — the cleanest contrasting architecture. It
   is an English-focused, instruction-tuned, text-only 14B model, uses the MIT
   licence, has a chat template, and contains about **8.25 GB** of weight
   shards. Pin revision `fc0f8f23d369dc29b55cad1d65cb5bf0dcbee910`.
3. **`mlx-community/Qwen3-14B-4bit`** — a true `mlx-lm` text-generation model
   and a useful test of whether dense scale fixes the 4B model's semantic
   errors. It is public and ungated, Apache-2.0, has a chat template, and
   contains about **8.31 GB** of weight shards. Pin revision
   `a4d9b2df59d2c150bef02fcbe0d91046b7ca33a4`.

Do not infer suitability from general benchmarks alone. None of the source
cards evaluates byte-preserving prompt correction, British style, resistance
to embedded prompt injection, or minimal semantic edits. The three models
above should therefore enter the existing 30-case development screen, with the
holdout kept closed.

## Ranked candidates

| Rank | Repository | Runtime and chat status | Weight shards | Licence / access | Main risk |
|---:|---|---|---:|---|---|
| 1 | [`mlx-community/Qwen3.5-9B-MLX-4bit`](https://huggingface.co/mlx-community/Qwen3.5-9B-MLX-4bit) | MLX checkpoint with `Qwen3_5ForConditionalGeneration`; embedded system/user template; use the VLM-capable MLX path and text-only inputs | 5.95 GB | Apache-2.0; public, ungated | It is a unified vision-language architecture, not a conventional `mlx-lm`-only causal LM. Explicitly disable thinking and verify the existing JSON adapter. |
| 2 | [`mlx-community/phi-4-4bit`](https://huggingface.co/mlx-community/phi-4-4bit) | Text generation, `Phi3ForCausalLM`; embedded chat template | 8.25 GB | MIT; public, ungated | English-focused but not British-English-specific; its training emphasis on reasoning/code may encourage rewriting rather than minimal correction. |
| 3 | [`mlx-community/Qwen3-14B-4bit`](https://huggingface.co/mlx-community/Qwen3-14B-4bit) | Text generation, `Qwen3ForCausalLM`; embedded chat template and `enable_thinking=false` switch | 8.31 GB | Apache-2.0; public, ungated | Qwen3 can emit reasoning unless non-thinking mode is forced; 4-bit quantisation may still damage subtle edit decisions. |
| 4 | [`mlx-community/Qwen3-30B-A3B-4bit`](https://huggingface.co/mlx-community/Qwen3-30B-A3B-4bit) | Text generation, `Qwen3MoeForCausalLM`; 128 experts, 8 active per token; embedded chat template | 17.17 GB | Apache-2.0; public, ungated | The 30B total weight footprint increases load/memory traffic even though only about 3B parameters are active per token. It is a useful escalation, not the cheapest next test. |
| 5 | [`mlx-community/Mistral-Small-24B-Instruct-2501-4bit`](https://huggingface.co/mlx-community/Mistral-Small-24B-Instruct-2501-4bit) | `MistralForCausalLM`; instruct checkpoint with explicit system/user/assistant template | 13.26 GB | Apache-2.0; public, ungated | Larger latency and memory cost; the MLX repository metadata is tagged with `vllm` rather than `mlx`, so perform a one-request load/chat-template smoke test before running the corpus. |

All five weight sets fit within 48 GB with substantial room for the runtime,
KV cache and the operating system. This is an inference from their repository
file sizes, not a measured peak-memory claim. MLX-LM's official documentation
warns that models large relative to physical RAM can become slow and explains
that cache size also affects memory and quality; keeping the correction prompt
short makes these candidates much safer than their maximum-context figures
would suggest. See the [MLX-LM README](https://github.com/ml-explore/mlx-lm#large-models).

## Why these are credible candidates

### Qwen3.5 9B

The original [`Qwen/Qwen3.5-9B`](https://huggingface.co/Qwen/Qwen3.5-9B)
card says this is the **post-trained** 9B model, despite its base-model lineage,
and reports IFEval 91.5 and IFBench 64.5. Those are Qwen's own results, not an
independent evaluation, but they make the 9B model a rational next step over
the failed 4B checkpoint. The MLX conversion's files and exact sizes are
available through its [repository tree](https://huggingface.co/api/models/mlx-community/Qwen3.5-9B-MLX-4bit/tree/main?recursive=true&expand=false).

The checkpoint is multimodal-capable but not multimodal-only: its chat template
accepts ordinary string content, including a system message. That makes it
usable for text correction. Run with `enable_thinking=false`; reasoning text is
unnecessary latency and creates another way for a strict JSON response to fail.

### Phi-4 14B

The original [`microsoft/phi-4`](https://huggingface.co/microsoft/phi-4) card
describes a 14B text model post-trained with supervised fine-tuning and direct
preference optimisation, with an emphasis on precise instruction following.
The MLX conversion is a normal causal text model with an embedded chat template,
making it operationally simpler than Qwen3.5. Its exact current metadata and
revision are exposed by the [Hugging Face model API](https://huggingface.co/api/models/mlx-community/phi-4-4bit),
and its shard sizes by the [tree API](https://huggingface.co/api/models/mlx-community/phi-4-4bit/tree/main?recursive=true&expand=false).

### Qwen3 14B and 30B-A3B

Both Qwen3 conversions are text-generation checkpoints with explicit chat
templates and non-thinking support. The 14B dense model provides a clean scale
comparison; the 30B-A3B mixture-of-experts model offers more total capacity
while activating eight of 128 experts per token. Repository metadata confirms
the [14B revision and configuration](https://huggingface.co/api/models/mlx-community/Qwen3-14B-4bit)
and the [30B-A3B revision and expert configuration](https://huggingface.co/api/models/mlx-community/Qwen3-30B-A3B-4bit).

Qwen's original [`Qwen/Qwen3-14B`](https://huggingface.co/Qwen/Qwen3-14B)
documentation recommends explicitly switching between thinking and
non-thinking modes. For this pipeline, non-thinking mode is mandatory. The
benchmark should preserve the production decoding configuration instead of
silently changing it between candidates.

### Mistral Small 24B

The source [`mistralai/Mistral-Small-24B-Instruct-2501`](https://huggingface.co/mistralai/Mistral-Small-24B-Instruct-2501)
is an instruction checkpoint rather than a base model. The conversion's
[metadata](https://huggingface.co/api/models/mlx-community/Mistral-Small-24B-Instruct-2501-4bit)
contains a complete system/user/assistant chat template, and the
[repository tree](https://huggingface.co/api/models/mlx-community/Mistral-Small-24B-Instruct-2501-4bit/tree/main?recursive=true&expand=false)
shows three weight shards totalling about 13.26 GB. It is worth retaining as a
cross-family fallback, but only after a load smoke test because its repository
metadata does not identify `mlx` as the primary library.

## Models deliberately excluded

- Base/pre-trained-only checkpoints, including Gemma `-pt` variants, because
  correction depends on reliable instruction and output-format following.
- Multimodal checkpoints that lack a usable text chat template. Multimodal
  capability alone is not disqualifying; absence of a text path is.
- The previously tested Gemma 3n E4B checkpoint, because it lacked a usable
  chat template under the tested MLX runtime and produced degenerate output.
- Qwen3.6 27B/35B variants for now. No evidence gathered here shows that they
  improve conservative correction enough to justify adding another large
  candidate before the ranked models are screened.
- Community fine-tunes and nonstandard OptiQ/oQ quantisations in the first
  pass. They add an extra variable when the immediate question is whether
  model capability, rather than quantiser or serving stack, fixes semantic
  corruption.

## Benchmark protocol

1. Pin the stated repository revision and record the installed MLX runtime
   version.
2. Run a one-request load, chat-template and strict-JSON smoke test.
3. Use non-thinking mode where supported, the same correction system prompt,
   the same protected-span masker and the same decoding settings for every
   candidate.
4. Run the existing 30 curated development cases and 30 protected-span cases.
5. Reject on any schema failure, unchanged-input violation, protected-span
   mutation or detected semantic change. Compare latency only among models
   that pass those gates.
6. If every 4-bit candidate fails narrowly, retest only the strongest model in
   8-bit. On 48 GB, the currently available Qwen3.5 9B, Phi-4 and Qwen3 14B
   8-bit conversions (roughly 10–16 GB of weights) are practical ways to test
   whether quantisation caused the failure.

## Source-quality note

Discovery used web search, but the facts retained above come from first-party
Hugging Face repository metadata/model cards and Apple's official MLX-LM
repository. Capability scores are labelled as model-maker-reported. No model
was downloaded or executed during this research.
