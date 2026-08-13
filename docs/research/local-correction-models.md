# Local correction models and runtimes

Research date: 11 August 2026

## Question

Which locally runnable instruction models around 1B–3B parameters should Correction test for British-English prompt correction on Apple Silicon macOS, using a separately installed HTTP runtime, while targeting no more than two seconds of warm added latency for a typical short prompt?

## Recommendation

Use **Ollama as the v0.1 reference runtime** and benchmark these models in this order:

1. **`qwen3.5:2b`** — the leading quality candidate. It is a current 2B post-trained model under Apache 2.0 with a native 262,144-token context. The official Ollama tag is a 2.27B-parameter Q8_0 package occupying 2.7 GB. Qwen's own task-agnostic evaluations show stronger multilingual results than Qwen3 1.7B, but do not measure British-English correction. [Qwen model card](https://huggingface.co/Qwen/Qwen3.5-2B#model-overview), [Ollama artefact](https://ollama.com/library/qwen3.5:2b)
2. **`qwen3:1.7b`** — the leading speed/quality candidate. It is Apache 2.0, supports more than 100 languages and dialects, has a 32,768-token context, and its official Ollama Q4_K_M package occupies 1.4 GB. It also has a documented non-thinking mode, which is important for latency and avoiding unnecessary hidden generation. [Qwen model card](https://huggingface.co/Qwen/Qwen3-1.7B#model-overview), [Ollama artefact](https://ollama.com/library/qwen3:1.7b)
3. **`gemma3:1b`** — the latency floor and likely fallback for slower Macs. It has a 32K input context and an 8,192-token output limit; Ollama's Q4_K_M package occupies 815 MB. It is governed by Google's Gemma Terms rather than Apache 2.0, and direct Hugging Face access requires accepting those terms. [Google model card](https://huggingface.co/google/gemma-3-1b-it#model-information), [Ollama artefact](https://ollama.com/library/gemma3:1b)
4. **`granite3.3:2b`** — a useful independent control. IBM describes it as an English-capable instruction-following model under Apache 2.0 with 128K context; its official Ollama Q4_K_M package is 2.53B parameters and 1.5 GB. [IBM model card](https://huggingface.co/ibm-granite/granite-3.3-2b-instruct), [Ollama artefact](https://ollama.com/library/granite3.3:2b)

Do **not** select a production default before the correction-specific evaluation. Generic instruction-following, translation, and multilingual benchmarks are only weak proxies for preserving a technical prompt while applying British spelling and phrasing. The model must win on the repository's own examples, especially the unchanged-span and semantic-preservation checks.

The probable outcome is:

- **Qwen3.5 2B** if its Q8 package stays under the two-second limit and reliably obeys the output schema;
- **Qwen3 1.7B** if Qwen3.5 is too slow or too prone to unnecessary reasoning;
- **Gemma 3 1B** as a low-memory/low-latency profile if its correction quality is adequate.

This is an inference from model size, quantisation, and documented capabilities—not a measured result. No candidate is installed in the current workspace, and the available primary sources do not publish comparable warm Apple-Silicon latency for this correction workload.

## Candidate comparison

| Candidate | Licence and access | Context | Official Ollama package | Relevant strengths | Risks to test |
| --- | --- | ---: | ---: | --- | --- |
| Qwen3.5 2B | Apache 2.0; ungated model card | 262,144 native | Q8_0, 2.7 GB | Current 2B model; post-trained; multilingual; non-thinking text generation is documented | The official Ollama package is Q8 rather than Q4; Qwen warns that the 2B model can enter loops in thinking mode, so thinking must remain off for correction |
| Qwen3 1.7B | Apache 2.0; ungated | 32,768 | Q4_K_M, 1.4 GB | Mature support across Ollama, MLX-LM and llama.cpp; explicit thinking/non-thinking switch; 100+ languages/dialects | Older and lower-scoring than Qwen3.5 on Qwen's general multilingual evaluations; must prove reliable JSON and semantic fidelity |
| Gemma 3 1B IT | Gemma Terms; Hugging Face requires terms acceptance | 32K input; 8,192 output | Q4_K_M, 815 MB | Smallest package; Google positions Gemma 3 for deployment on resource-limited devices | Custom terms add distribution friction; 1B capacity may be insufficient for code-aware span preservation and nuanced meaning |
| Granite 3.3 2B Instruct | Apache 2.0; ungated | 128K | Q4_K_M, 1.5 GB | English is explicitly supported; instruction-following and extraction are intended capabilities | Less direct evidence for rewriting quality; the Ollama artefact reports 2.53B parameters despite the 2B family name |

Sources: [Qwen3.5 model overview and evaluations](https://huggingface.co/Qwen/Qwen3.5-2B#model-overview), [Qwen3 model overview](https://huggingface.co/Qwen/Qwen3-1.7B#model-overview), [Gemma 3 model information](https://huggingface.co/google/gemma-3-1b-it#model-information), [Granite 3.3 model card](https://huggingface.co/ibm-granite/granite-3.3-2b-instruct), and the corresponding official Ollama artefacts linked in the table.

### Structured output

Structured output should be treated as a **runtime-enforced contract**, not as an unsupported assumption about a small model. Ollama accepts either JSON or a JSON Schema in the chat API's `format` field and recommends validating the returned data with the application's schema library. It also supports schema-constrained output through its OpenAI-compatible API. [Ollama structured-output documentation](https://docs.ollama.com/capabilities/structured-outputs), [Ollama chat API](https://docs.ollama.com/api/chat)

For the benchmark, require a small schema such as:

```json
{
  "type": "object",
  "properties": {
    "changed": { "type": "boolean" },
    "corrected_text": { "type": "string" }
  },
  "required": ["changed", "corrected_text"],
  "additionalProperties": false
}
```

Schema validity is necessary but not sufficient: the pipeline must still reject an empty, truncated, or semantically unsafe rewrite and pass through the original prompt on failure.

### Context limits

Every candidate has far more context than a typical interactive prompt. Correction should nevertheless configure a deliberately small runtime context for predictable memory use and latency rather than inheriting each model's maximum. Qwen explicitly warns that its 262,144-token default can cause out-of-memory errors and advises reducing the context window when necessary. [Qwen3.5 serving guidance](https://huggingface.co/Qwen/Qwen3.5-2B#serving-qwen35)

A **4K context limit** is sufficient for the v0.1 “typical short prompt” path. Prompts beyond the configured correction limit should bypass correction unchanged rather than be silently truncated. This 4K value is a product recommendation, not a limit imposed by the models.

## Runtime assessment

### Recommended: Ollama

Ollama is the best reference runtime for v0.1 because it provides all required integration primitives without making Correction manage weights:

- a local API at `http://localhost:11434/api` after installation; [API introduction](https://docs.ollama.com/api/introduction)
- native and partially OpenAI-compatible chat endpoints; [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)
- JSON-Schema-constrained generation; [structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
- a `keep_alive` request option to keep a model resident; and
- response telemetry for total, load, prompt-evaluation, and generation durations and token counts. [chat API](https://docs.ollama.com/api/chat)

These timings allow the prototype to distinguish cold model loading from warm inference without logging prompt content. The benchmark should set a non-zero `keep_alive`, send an untimed warm-up request, and record the API timing fields for subsequent requests.

Ollama's API is expected to remain backwards compatible, but its documentation says the API is not strictly versioned. The adapter should therefore perform a startup capability check and report an actionable error for an unsupported runtime version. [Ollama API versioning](https://docs.ollama.com/api/introduction#versioning)

### Alternative: llama.cpp server

Keep llama.cpp as the portability/control runtime, not the first prototype dependency. Its lightweight HTTP server supports quantised CPU/GPU inference, OpenAI-compatible chat and responses routes, schema-constrained JSON, explicit context sizing, prompt-cache reuse, timing output, and a prediction time limit. [llama.cpp server documentation](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)

It offers tighter control than Ollama and is valuable if Ollama cannot meet the latency target, but it shifts model acquisition, GGUF selection, chat-template compatibility, and server lifecycle onto the user or Correction. That additional surface is not justified until an Ollama benchmark identifies a concrete limitation.

### Alternative: MLX-LM

MLX-LM is optimised for Apple Silicon, supports model quantisation and prompt caching, and includes a local HTTP server. [MLX-LM repository](https://github.com/ml-explore/mlx-lm) Its maintainers describe the server as an OpenAI-compatible local endpoint, but not as a broader production server. [Maintainer response](https://github.com/ml-explore/mlx-lm/discussions/371#discussioncomment-14089406)

MLX-LM is worth a later performance comparison if Ollama fails the target. It is not the initial recommendation because Ollama has clearer first-party documentation for JSON Schema enforcement, model residency, and per-request timing—the exact controls this pipeline needs.

## Quantisation and memory

The package sizes above are the most useful minimum planning numbers because they are the actual official Ollama artefacts, not estimates from parameter counts. Runtime memory will be **higher than the package size** because it also includes the KV cache and runtime buffers. Context length, prompt length, and concurrency therefore need to be held constant during comparison.

Use the published Ollama tags exactly for the first benchmark:

```text
qwen3.5:2b       Q8_0    2.7 GB
qwen3:1.7b       Q4_K_M  1.4 GB
gemma3:1b        Q4_K_M  815 MB
granite3.3:2b    Q4_K_M  1.5 GB
```

The figures and quantisation types come from the official [Qwen3.5](https://ollama.com/library/qwen3.5:2b), [Qwen3](https://ollama.com/library/qwen3:1.7b), [Gemma 3](https://ollama.com/library/gemma3:1b), and [Granite 3.3](https://ollama.com/library/granite3.3:2b) artefact pages.

Do not introduce a community Q4 conversion of Qwen3.5 into the first comparison. It would confound the model comparison with an unverified conversion. If Qwen3.5 Q8 wins on quality but misses latency, a second experiment can compare a pinned GGUF/MLX quantisation, recording its source, hash, conversion settings, and licence.

## Latency assessment

The two-second target is plausible for this size range only as a **warm, bounded-output target**. It cannot be guaranteed from parameter count alone: Apple chip generation, memory bandwidth, quantisation, context size, prompt length, output length, model residency, and runtime version all affect it.

Expected ordering, expressed deliberately as a hypothesis:

| Candidate | Relative warm-latency expectation | Two-second risk |
| --- | --- | --- |
| Gemma 3 1B Q4 | Fastest | Lowest, but quality may fail |
| Qwen3 1.7B Q4 | Fast | Low to medium |
| Granite 3.3 2B Q4 | Fast to moderate | Medium |
| Qwen3.5 2B Q8 | Moderate | Highest of the shortlist, but may deliver the best quality |

This ordering is inferred from the official package sizes and quantisations; it is not a vendor benchmark. The Ollama timing fields provide the primary measurement mechanism. [Ollama chat response metrics](https://docs.ollama.com/api/chat)

## Empirical selection gate

Run the same pinned evaluation corpus and schema against every candidate. Define “typical short prompt” before measuring; a reasonable initial profile is at most 120 input tokens and at most 180 output tokens, with longer prompts reported separately.

### Corpus

Include at least these groups:

- spelling, grammar, punctuation, and British-vocabulary corrections;
- already-correct prompts that must remain byte-for-byte unchanged;
- prompts mixing prose with fenced code, inline code, URLs, absolute and relative paths, flags, slash commands, agent mentions, JSON, and shell fragments;
- deliberately ambiguous sentences where rewriting risks changing intent;
- technical requirements containing negation, numbers, versions, quoted strings, identifiers, and acceptance criteria;
- adversarial text instructing the correction model to ignore its contract or answer the user's prompt.

### Hard quality gates

- 100% valid schema after at most one retry;
- 100% preservation of protected spans;
- no added or removed requirements in the curated semantic test set;
- no answer to, or execution of, the user's prompt;
- unchanged input returned unchanged;
- original prompt passed through on timeout, malformed output, or failed validation.

Human review should score British-English naturalness and meaning preservation blindly. Generic model-card benchmarks must not substitute for this evaluation.

### Performance gate

For each model and target Mac profile:

1. Record runtime version, macOS version, chip, total unified memory, model tag/digest, package size, quantisation, context size, and generation settings.
2. Load the model and make one untimed warm-up request with a non-zero `keep_alive`.
3. Run every corpus item at least five times in a randomised order with concurrency one.
4. Record end-to-end wall time plus Ollama's `load_duration`, `prompt_eval_duration`, `eval_duration`, `prompt_eval_count`, and `eval_count`.
5. Report warm p50 and p95 by prompt-length bucket. Report cold start separately.
6. Pass only if typical-short warm p95 is at most two seconds and all hard quality gates pass.

Use non-thinking generation for correction. Qwen3 explicitly supports disabling thinking, and Qwen3.5 documents non-thinking sampling separately; Qwen also warns that Qwen3.5 2B can loop in thinking mode. [Qwen3 thinking switch](https://huggingface.co/Qwen/Qwen3-1.7B#switching-between-thinking-and-non-thinking-mode), [Qwen3.5 generation guidance](https://huggingface.co/Qwen/Qwen3.5-2B#using-qwen35-via-the-chat-completions-api)

Benchmark deterministic and vendor-recommended sampling settings rather than assuming one temperature is universally best. Ollama recommends a low temperature for reliable structured output, while Qwen publishes different sampling guidance for its models. [Ollama structured-output tips](https://docs.ollama.com/capabilities/structured-outputs#tips-for-reliable-structured-outputs), [Qwen3.5 sampling guidance](https://huggingface.co/Qwen/Qwen3.5-2B#using-qwen35-via-the-chat-completions-api)

## Decision for the prototype

Adopt these provisional defaults until the benchmark is run:

- runtime: Ollama native chat API;
- endpoint: configurable, defaulting to `http://localhost:11434`;
- primary model under test: `qwen3.5:2b`;
- speed fallback under test: `qwen3:1.7b`;
- context: 4K for the correction processor;
- thinking: disabled;
- response: runtime-constrained JSON Schema plus application validation;
- model residency: non-zero `keep_alive`;
- concurrency: one;
- failure behaviour: return the untouched original prompt.

The **model identifier must remain configuration**, because the winner will vary by target Mac and future model releases. The benchmark result—not this desk research—should set the shipped default.
