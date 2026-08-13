# Codex vertical slice

This throwaway client proves the v0.1 interaction boundary. Correction owns a
line-oriented terminal, transforms each prompt locally, asks the user to
approve, edit, bypass, or cancel, and only then sends the selected text to a
Codex App Server child over private JSONL stdio.

Run the deterministic no-network walkthrough:

```sh
npm run prototype:codex:demo
```

Run against the configured local model and the installed Codex:

```sh
npm run prototype:codex
npm run prototype:codex -- --resume THREAD_ID
npm run prototype:codex -- --config /absolute/path/config.toml
```

The command discovers `~/.config/correction/config.toml` and then
`<git-root>/.correction.toml`. `--config` disables discovery. Repository config
cannot change runtime endpoints, host commands, prompts, content logging, or
weaken approval/error policy. CLI `--approval always|risky|never` is the only
implemented safe override; `risky` remains experimental and treats the current
processor's `unknown` risk as review-required.

Default diagnostics are content-free JSONL on stderr: prompt length, line count,
a short SHA-256 correlation key, processor outcome, and warm wall latency. A
failed local runtime follows the configured `on_error`: the default `continue`
reviews the untouched prompt instead of preventing Codex use.

The prototype deliberately omits terminal rich text, history, multimodal input,
Codex `requestUserInput`/MCP elicitation forwarding, and production packaging.
