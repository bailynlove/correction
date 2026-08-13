#!/usr/bin/env node
import process from "node:process";

import type { z } from "zod";

import { MlxModel } from "../models/mlx-model.js";
import { OllamaModel } from "../models/ollama-model.js";
import type {
  GenerationMetrics,
  StructuredGeneration,
  StructuredGenerationResult,
  StructuredModel,
} from "../models/structured-model.js";
import { EnglishCorrection } from "../processors/english-correction/english-correction.js";
import { CodexHost } from "./codex-host.js";
import { durationMs, loadConfig } from "./config.js";
import { diagnostic, promptMetadata, traceMetadata } from "./diagnostics.js";
import { PromptPipeline, type ConfiguredProcessor } from "./pipeline.js";
import { CorrectionSession, type HostSession } from "./session.js";
import { TerminalUi } from "./terminal-ui.js";

interface Arguments {
  readonly config?: string;
  readonly resume?: string;
  readonly approval?: "always" | "risky" | "never";
  readonly demo: boolean;
}

function parseArguments(args: readonly string[]): Arguments {
  let config: string | undefined;
  let resume: string | undefined;
  let approval: Arguments["approval"];
  let demo = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "codex") continue;
    if (argument === "--demo") { demo = true; continue; }
    const value = args[index + 1];
    if (argument === "--config" && value !== undefined) { config = value; index += 1; continue; }
    if (argument === "--resume" && value !== undefined) { resume = value; index += 1; continue; }
    if (argument === "--approval" && (value === "always" || value === "risky" || value === "never")) {
      approval = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown or incomplete argument: ${argument ?? ""}`);
  }
  return {
    demo,
    ...(config === undefined ? {} : { config }),
    ...(resume === undefined ? {} : { resume }),
    ...(approval === undefined ? {} : { approval }),
  };
}

const ZERO_METRICS: GenerationMetrics = {
  wallDurationNs: 1_000_000,
  totalDurationNs: 1_000_000,
  loadDurationNs: 0,
  promptEvalDurationNs: 0,
  evalDurationNs: 0,
  promptEvalCount: 0,
  evalCount: 0,
};

class DemoModel implements StructuredModel {
  async generate<T>(request: StructuredGeneration<T>, _signal: AbortSignal): Promise<StructuredGenerationResult<T>> {
    const match = request.input.match(/<BEGIN_TEXT_TO_EDIT>\n([\s\S]*)\n<END_TEXT_TO_EDIT>/);
    const original = match?.[1] ?? request.input;
    const correctedText = original
      .replace(/\bCan you helps\b/g, "Can you help")
      .replace(/\bcolor\b/g, "colour")
      .replace(/\bappolish\b/g, "polish")
      .replace(/\bnatrual\b/g, "natural");
    return {
      value: request.schema.parse({ correctedText }) as z.infer<typeof request.schema>,
      metrics: ZERO_METRICS,
    } as StructuredGenerationResult<T>;
  }
}

class DemoHost implements HostSession {
  readonly threadId = "demo-thread";
  async runTurn(prompt: string): Promise<void> {
    process.stdout.write(`codex-demo> received: ${prompt}\n`);
  }
  async close(): Promise<void> {}
}

function modelFor(kind: "ollama" | "mlx", endpoint: string): StructuredModel {
  return kind === "ollama" ? new OllamaModel(endpoint) : new MlxModel(endpoint);
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const loaded = loadConfig({
    cwd: process.cwd(),
    ...(args.config === undefined ? {} : { explicitPath: args.config }),
    ...(args.approval === undefined ? {} : { approvalMode: args.approval }),
  });
  diagnostic(loaded.config.diagnostics.level, "debug", "config.loaded", {
    sources: loaded.sources,
    content_logging: loaded.config.diagnostics.content,
  });

  const processors: ConfiguredProcessor[] = [];
  for (const name of loaded.config.pipeline.processors) {
    const configured = loaded.config.processors[name];
    if (configured === undefined || !configured.enabled) continue;
    const runtime = loaded.config.runtimes[configured.runtime];
    if (runtime === undefined) throw new Error(`missing runtime ${configured.runtime}`);
    const model = args.demo ? new DemoModel() : modelFor(runtime.kind, runtime.endpoint);
    processors.push({
      name,
      onError: configured.on_error,
      timeoutMs: durationMs(configured.timeout),
      processor: new EnglishCorrection(model, {
        model: configured.model,
        contextTokens: configured.options.context_tokens,
        maxOutputTokens: configured.options.max_output_tokens,
        keepAlive: runtime.keep_alive,
        temperature: configured.options.temperature,
      }),
    });
  }

  const ui = new TerminalUi();
  let host: HostSession | undefined;
  try {
    const command = loaded.config.hosts.codex?.command;
    if (command === undefined) throw new Error("hosts.codex.command is missing");
    host = args.demo
      ? new DemoHost()
      : await CodexHost.connect({
          command,
          cwd: process.cwd(),
          ...(args.resume === undefined ? {} : { resume: args.resume }),
          approve: (summary) => ui.approveHostAction(summary),
        });
    process.stdout.write(`Correction connected to Codex thread ${host.threadId}. Type :quit to exit.\n`);
    const session = new CorrectionSession(
      new PromptPipeline(processors, durationMs(loaded.config.pipeline.timeout)),
      ui,
      host,
      {
        approvalMode: loaded.config.approval.mode,
        maxReviewCycles: loaded.config.approval.max_review_cycles,
        onOutcome: (outcome) => {
          const hasFailure = outcome.traces.some((trace) => trace.result === "error" || trace.result === "timeout");
          diagnostic(loaded.config.diagnostics.level, hasFailure ? "warn" : "info", "pipeline.completed", {
            outcome: outcome.kind,
            ...promptMetadata(outcome.original, loaded.config.diagnostics.content),
            ...traceMetadata(outcome.traces),
          });
        },
      },
    );

    while (true) {
      const input = await ui.prompt();
      if (input.trim() === ":quit") break;
      if (input.length === 0) continue;
      const result = await session.submit(input);
      if (result.kind === "blocked") process.stderr.write(`Correction blocked the prompt: ${result.reason}\n`);
      if (result.kind === "cancelled") process.stdout.write("Prompt cancelled.\n");
    }
  } finally {
    ui.close();
    await host?.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`correction: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
