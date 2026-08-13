import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parse } from "smol-toml";
import { z } from "zod";

const durationSchema = z.string().regex(/^\d+(?:ms|s)$/);
const runtimeSchema = z.strictObject({
  kind: z.enum(["ollama", "mlx"]),
  endpoint: z.url(),
  keep_alive: z.string().min(1).default("5m"),
});
const processorSchema = z.strictObject({
  enabled: z.boolean().default(true),
  kind: z.literal("english-correction"),
  runtime: z.string().min(1),
  model: z.string().min(1),
  on_error: z.enum(["continue", "block"]).default("continue"),
  timeout: durationSchema,
  options: z.strictObject({
    locale: z.literal("en-GB").default("en-GB"),
    context_tokens: z.number().int().positive().default(4096),
    max_output_tokens: z.number().int().positive().default(512),
    temperature: z.number().min(0).max(2).default(0),
  }),
});
const hostSchema = z.strictObject({
  kind: z.literal("codex-app-server"),
  command: z.array(z.string().min(1)).min(1),
});

const configSchema = z.strictObject({
  config_version: z.literal(1),
  pipeline: z.strictObject({
    processors: z.array(z.string().min(1)),
    timeout: durationSchema,
  }),
  approval: z.strictObject({
    mode: z.enum(["always", "risky", "never"]),
    max_review_cycles: z.number().int().min(0).max(20),
  }),
  runtimes: z.record(z.string(), runtimeSchema),
  processors: z.record(z.string(), processorSchema),
  hosts: z.record(z.string(), hostSchema),
  diagnostics: z.strictObject({
    level: z.enum(["error", "warn", "info", "debug"]),
    sink: z.literal("stderr"),
    format: z.literal("jsonl"),
    content: z.boolean(),
  }),
});

export type CorrectionConfig = z.infer<typeof configSchema>;

const DEFAULTS: CorrectionConfig = {
  config_version: 1,
  pipeline: { processors: ["british-english"], timeout: "2s" },
  approval: { mode: "always", max_review_cycles: 3 },
  runtimes: {
    "local-ollama": {
      kind: "ollama",
      endpoint: "http://127.0.0.1:11434",
      keep_alive: "5m",
    },
  },
  processors: {
    "british-english": {
      enabled: true,
      kind: "english-correction",
      runtime: "local-ollama",
      model: "qwen3.5:2b",
      on_error: "continue",
      timeout: "1800ms",
      options: {
        locale: "en-GB",
        context_tokens: 4096,
        max_output_tokens: 512,
        temperature: 0,
      },
    },
  },
  hosts: {
    codex: { kind: "codex-app-server", command: ["codex", "app-server"] },
  },
  diagnostics: {
    level: "warn",
    sink: "stderr",
    format: "jsonl",
    content: false,
  },
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function merge(left: JsonObject, right: JsonObject): JsonObject {
  const output: JsonObject = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const previous = output[key];
    output[key] = isObject(previous) && isObject(value)
      ? merge(previous, value)
      : value;
  }
  return output;
}

function readToml(path: string): JsonObject {
  const value = parse(readFileSync(path, "utf8"));
  if (!isObject(value)) throw new Error(`${path}: TOML root must be a table`);
  return value;
}

function repositoryRoot(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function validateRepoLayer(layer: JsonObject, defaults: CorrectionConfig): void {
  if (layer.runtimes !== undefined || layer.hosts !== undefined) {
    throw new Error("repository config cannot override runtimes or host commands");
  }
  const diagnostics = layer.diagnostics;
  if (isObject(diagnostics) && "content" in diagnostics) {
    throw new Error("repository config cannot override diagnostic content logging");
  }
  const approval = layer.approval;
  if (isObject(approval) && typeof approval.mode === "string") {
    const strength = { never: 0, risky: 1, always: 2 } as const;
    const requested = strength[approval.mode as keyof typeof strength];
    if (requested === undefined || requested < strength[defaults.approval.mode]) {
      throw new Error("repository config cannot weaken the approval mode");
    }
  }
  const processors = layer.processors;
  if (isObject(processors)) {
    for (const [name, value] of Object.entries(processors)) {
      if (!isObject(value)) continue;
      if (value.on_error !== undefined) {
        const base = defaults.processors[name]?.on_error ?? "continue";
        const strength = { continue: 0, block: 1 } as const;
        const requested = strength[value.on_error as keyof typeof strength];
        if (requested === undefined || requested < strength[base]) {
          throw new Error("repository config cannot weaken processor error policy");
        }
      }
      if ("prompt" in value || (isObject(value.options) && "prompt" in value.options)) {
        throw new Error("repository config cannot override processor prompts");
      }
      if (value.on_error !== undefined && value.on_error !== "continue" && value.on_error !== "block") {
        throw new Error("repository config cannot weaken processor error policy");
      }
    }
  }
}

export interface LoadConfigOptions {
  readonly cwd: string;
  readonly explicitPath?: string;
  readonly approvalMode?: "always" | "risky" | "never";
}

export interface LoadedConfig {
  readonly config: CorrectionConfig;
  readonly sources: readonly string[];
}

export function loadConfig(options: LoadConfigOptions): LoadedConfig {
  let merged: JsonObject = structuredClone(DEFAULTS) as JsonObject;
  const sources = ["built-in defaults"];

  if (options.explicitPath !== undefined) {
    const path = resolve(options.explicitPath);
    merged = merge(merged, readToml(path));
    sources.push(path);
  } else {
    const userPath = join(homedir(), ".config", "correction", "config.toml");
    if (existsSync(userPath)) {
      merged = merge(merged, readToml(userPath));
      sources.push(userPath);
    }
    const root = repositoryRoot(options.cwd);
    if (root !== undefined) {
      const repoPath = join(root, ".correction.toml");
      if (existsSync(repoPath)) {
        const layer = readToml(repoPath);
        validateRepoLayer(layer, configSchema.parse(merged));
        merged = merge(merged, layer);
        sources.push(repoPath);
      }
    }
  }

  if (options.approvalMode !== undefined) {
    merged = merge(merged, { approval: { mode: options.approvalMode } });
    sources.push("command line");
  }
  const config = configSchema.parse(merged);
  for (const name of config.pipeline.processors) {
    const processor = config.processors[name];
    if (processor === undefined) throw new Error(`pipeline references unknown processor ${name}`);
    if (config.runtimes[processor.runtime] === undefined) {
      throw new Error(`processor ${name} references unknown runtime ${processor.runtime}`);
    }
  }
  if (config.hosts.codex === undefined) throw new Error("hosts.codex is required");
  return { config, sources };
}

export function durationMs(value: string): number {
  const amount = Number.parseInt(value, 10);
  return value.endsWith("ms") ? amount : amount * 1000;
}
