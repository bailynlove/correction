# Codex vertical-slice validation

Date: 2026-08-13
Pinned host: `codex-cli 0.147.0`

## Result

The prototype demonstrates the required boundary: no prompt reaches the host
until Correction completes local processing and the configured approval flow.

- TypeScript strict build: pass.
- Existing automated suite: pass, 17/17.
- Deterministic TTY walkthrough: approve sends the British-English candidate;
  bypass sends the immutable original; protected inline code is unchanged.
- Real app-server handshake: pass through `initialize`, `initialized`, and
  `thread/start`; returned a real thread ID.
- Fail-open check: an unreachable local endpoint produced a content-free
  `english-correction-failed` diagnostic, preserved the original, and still
  required approval in `always` mode. Cancelling sent no Codex turn.
- Real end-to-end Codex turn: pass. After approval, the client sent
  `Reply with exactly: VERTICAL_SLICE_OK`, streamed `VERTICAL_SLICE_OK`, and
  returned to the input prompt on `turn/completed`.

The warm-latency field is captured per processor as `duration_ms`. The selected
Qwen3.5 9B quality reference remains outside the two-second p95 gate documented
by issue #9, so this slice proves integration rather than model acceptance.

## Prototype boundary

This is a successful interaction and integration prototype, not a releasable
v0.1. Production work still needs generated protocol bindings, forwarding for
Codex user-input and MCP elicitation requests, richer terminal input, and a
model/runtime choice that clears every frozen acceptance gate.
