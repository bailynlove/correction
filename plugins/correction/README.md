# Correction for Codex

This package deliberately does not register an English-correction
`UserPromptSubmit` hook. Codex hooks can block a prompt or add developer
context, but they cannot replace the submitted prompt with a locally corrected
candidate. Leaving the hook absent preserves the native Codex TUI without
pretending that the English-correction processor changed what the model sees.

Future non-transforming processors, such as a security checker, may use a
Codex hook from this package when their contract is block-or-continue.

Use the Pi extension in this repository when prompt transformation is required.
