import { MlxModel } from "../models/mlx-model.js";
import { OllamaModel } from "../models/ollama-model.js";
import type { StructuredModel } from "../models/structured-model.js";
import { EnglishCorrection } from "../processors/english-correction/english-correction.js";
import { durationMs, type CorrectionConfig } from "./config.js";
import { PromptPipeline, type ConfiguredProcessor } from "./pipeline.js";

type RuntimeConfig = CorrectionConfig["runtimes"][string];
export type ModelFactory = (runtime: RuntimeConfig) => StructuredModel;

function defaultModelFactory(runtime: RuntimeConfig): StructuredModel {
  return runtime.kind === "ollama"
    ? new OllamaModel(runtime.endpoint)
    : new MlxModel(runtime.endpoint);
}

export function createConfiguredPipeline(
  config: CorrectionConfig,
  modelFactory: ModelFactory = defaultModelFactory,
): PromptPipeline {
  const processors: ConfiguredProcessor[] = [];
  for (const name of config.pipeline.processors) {
    const configured = config.processors[name];
    if (configured === undefined || !configured.enabled) continue;
    const runtime = config.runtimes[configured.runtime];
    if (runtime === undefined) throw new Error(`missing runtime ${configured.runtime}`);
    processors.push({
      name,
      onError: configured.on_error,
      timeoutMs: durationMs(configured.timeout),
      processor: new EnglishCorrection(modelFactory(runtime), {
        model: configured.model,
        contextTokens: configured.options.context_tokens,
        maxOutputTokens: configured.options.max_output_tokens,
        keepAlive: runtime.keep_alive,
        temperature: configured.options.temperature,
      }),
    });
  }
  return new PromptPipeline(processors, durationMs(config.pipeline.timeout));
}
