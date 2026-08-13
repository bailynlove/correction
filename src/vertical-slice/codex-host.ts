import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

import type { HostSession } from "./session.js";

type RequestId = string | number;
type JsonObject = Record<string, unknown>;
interface PendingRequest {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
}

interface CodexHostOptions {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly resume?: string;
  readonly approve: (summary: string) => Promise<"accept" | "decline">;
}

function object(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

export class CodexHost implements HostSession {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #pending = new Map<RequestId, PendingRequest>();
  readonly #approve: CodexHostOptions["approve"];
  #nextId = 1;
  #threadId = "";
  #activeTurn: { resolve: () => void; reject: (error: Error) => void } | undefined;

  private constructor(child: ChildProcessWithoutNullStreams, approve: CodexHostOptions["approve"]) {
    this.#child = child;
    this.#approve = approve;
    createInterface({ input: child.stdout }).on("line", (line) => this.#receive(line));
    child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    child.on("exit", (code, signal) => {
      const error = new Error(`codex app-server exited (${code ?? signal ?? "unknown"})`);
      for (const pending of this.#pending.values()) pending.reject(error);
      this.#pending.clear();
      this.#activeTurn?.reject(error);
      this.#activeTurn = undefined;
    });
  }

  static async connect(options: CodexHostOptions): Promise<CodexHost> {
    const [executable, ...args] = options.command;
    if (executable === undefined) throw new Error("empty Codex host command");
    const child = spawn(executable, args, { cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"] });
    const host = new CodexHost(child, options.approve);
    await host.#request("initialize", {
      clientInfo: { name: "correction", title: "Correction", version: "0.0.0" },
      capabilities: { experimentalApi: false, requestAttestation: false },
    });
    host.#notify("initialized");
    const result = object(await host.#request(
      options.resume === undefined ? "thread/start" : "thread/resume",
      options.resume === undefined
        ? {
            cwd: options.cwd,
            approvalPolicy: "on-request",
            approvalsReviewer: "user",
            sandbox: "workspace-write",
            ephemeral: false,
          }
        : {
            threadId: options.resume,
            cwd: options.cwd,
            approvalPolicy: "on-request",
            approvalsReviewer: "user",
            sandbox: "workspace-write",
          },
    ));
    const thread = object(result?.thread);
    if (typeof thread?.id !== "string") throw new Error("Codex returned no thread id");
    host.#threadId = thread.id;
    return host;
  }

  get threadId(): string {
    return this.#threadId;
  }

  async runTurn(prompt: string): Promise<void> {
    if (this.#activeTurn !== undefined) throw new Error("a Codex turn is already active");
    const completion = new Promise<void>((resolve, reject) => {
      this.#activeTurn = { resolve, reject };
    });
    try {
      await this.#request("turn/start", {
        threadId: this.#threadId,
        input: [{ type: "text", text: prompt, text_elements: [] }],
      });
      await completion;
    } finally {
      this.#activeTurn = undefined;
    }
  }

  async close(): Promise<void> {
    if (this.#child.exitCode !== null) return;
    this.#child.kill("SIGTERM");
    await new Promise<void>((resolve) => this.#child.once("exit", () => resolve()));
  }

  #send(message: JsonObject): void {
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #notify(method: string, params?: JsonObject): void {
    this.#send({ method, ...(params === undefined ? {} : { params }) });
  }

  #request(method: string, params: JsonObject): Promise<unknown> {
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#send({ method, id, params });
    });
  }

  #receive(line: string): void {
    let message: JsonObject;
    try {
      const parsed = object(JSON.parse(line));
      if (parsed === undefined) throw new Error("message is not an object");
      message = parsed;
    } catch (error) {
      process.stderr.write(`correction: invalid app-server message: ${error instanceof Error ? error.message : "unknown"}\n`);
      return;
    }

    const id = message.id;
    if ((typeof id === "string" || typeof id === "number") && ("result" in message || "error" in message)) {
      const pending = this.#pending.get(id);
      if (pending === undefined) return;
      this.#pending.delete(id);
      if ("error" in message) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }

    if ((typeof id === "string" || typeof id === "number") && typeof message.method === "string") {
      void this.#handleServerRequest(id, message.method, object(message.params) ?? {});
      return;
    }

    if (message.method === "item/agentMessage/delta") {
      const params = object(message.params);
      if (typeof params?.delta === "string") process.stdout.write(params.delta);
      return;
    }
    if (message.method === "turn/completed") {
      process.stdout.write("\n");
      const params = object(message.params);
      const turn = object(params?.turn);
      if (turn?.status === "failed") this.#activeTurn?.reject(new Error(JSON.stringify(turn.error)));
      else this.#activeTurn?.resolve();
      return;
    }
    if (message.method === "error") {
      process.stderr.write(`codex: ${JSON.stringify(message.params)}\n`);
    }
  }

  async #handleServerRequest(id: RequestId, method: string, params: JsonObject): Promise<void> {
    if (method === "item/commandExecution/requestApproval") {
      const summary = [params.command, params.reason, params.cwd].filter((value) => typeof value === "string").join("\n");
      this.#send({ id, result: { decision: await this.#approve(summary || "command execution") } });
      return;
    }
    if (method === "item/fileChange/requestApproval") {
      const summary = typeof params.reason === "string" ? params.reason : "file changes";
      this.#send({ id, result: { decision: await this.#approve(summary) } });
      return;
    }
    this.#send({ id, error: { code: -32601, message: `unsupported server request: ${method}` } });
  }
}
