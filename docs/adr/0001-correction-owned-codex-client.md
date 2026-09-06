# Use a Correction-owned client over Codex App Server

Status: superseded by ADR 0004

Correction v0.1 is a single foreground TypeScript/Node process that owns terminal interaction, runs the prompt pipeline locally, and drives a pinned Codex App Server child over stdio. A Codex plugin was rejected as the primary integration because `UserPromptSubmit` hooks cannot replace submitted prompts or provide approve/edit/bypass interaction; owning the client preserves those semantics while host-neutral internal interfaces isolate the experimental Codex protocol.
