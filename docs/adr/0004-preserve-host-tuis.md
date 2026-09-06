# Preserve host TUIs with host-native adapters

Status: accepted

Date: 2026-08-14

## Context

The Correction-owned Codex App Server client proved that the prompt pipeline,
review modes, and streamed Codex turns can work together. It also replaced the
stock Codex terminal interface with a line-oriented prompt, hiding slash
commands, history navigation, multimodal composition, status displays, and
other mature host interaction.

Host extension capabilities differ. Pi 0.82.1 exposes an `input` event before
skill and template expansion. A handler can transform text and then return
control to Pi's native interaction lifecycle. Codex `UserPromptSubmit` hooks
can add developer context or block a prompt, but they do not expose prompt
replacement or an approve/edit/bypass interaction.

## Decision

Correction prefers a host-native host adapter whenever the host exposes the
required processor semantics.

- The Pi host adapter transforms ordinary user input and performs review with
  Pi-native dialogs. Pi commands, skills, prompt templates, history, and the
  rest of the Pi TUI remain owned by Pi.
- The Codex package preserves the native Codex TUI and does not run the English
  correction processor. It must not claim that added developer context is a
  replacement for the user's prompt.
- A future block-or-continue security processor may use a Codex
  `UserPromptSubmit` hook because that processor does not require prompt
  replacement.
- The Correction-owned App Server client remains a reference and diagnostic
  prototype, not the recommended product entry point.

## Consequences

Capabilities are explicit per host instead of forced behind one lowest-common-
denominator interface. Pi receives English correction without losing its TUI.
Codex retains its complete TUI but does not receive English correction until it
exposes a safe replacement interaction. Approval modes apply to transforming
host adapters; a Codex security hook will instead use block-or-continue
semantics.

The host-neutral prompt pipeline now receives the active host in its processing
context, and prompt mediation is separated from host dispatch so native
adapters can reuse review policy without owning an agent session.
