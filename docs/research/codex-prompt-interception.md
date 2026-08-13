# Codex prompt-interception options

Research date: 11 August 2026

Codex checked locally: `codex-cli 0.147.0`
First-party source snapshot: [`openai/codex@2cc9dbb`](https://github.com/openai/codex/tree/2cc9dbb9846b2dc03948414df6712adb967c70eb)

## Decision

For v0.1, implement the Codex host adapter as a thin terminal client over `codex app-server` using its local `stdio` JSON-RPC transport. The adapter must run Correction's local prompt pipeline and its approve/edit/bypass UI **before** it calls `turn/start`, then put only the selected final text in the request. App Server is explicitly intended for rich clients that need conversation history, approvals, and streamed events, and `turn/start` is the boundary at which a client supplies user input and begins Codex generation. [OpenAI App Server documentation](https://learn.chatgpt.com/docs/app-server#codex-app-server), [turn lifecycle](https://learn.chatgpt.com/docs/app-server#core-primitives), [turn request example](https://learn.chatgpt.com/docs/app-server#start-a-turn)

This is the only investigated, documented boundary that cleanly satisfies all four requirements at once:

1. inspect every text prompt;
2. show a transformed proposal before inference;
3. let the user approve, edit, bypass, or cancel it; and
4. avoid a main-model request until the final prompt has been selected.

The native `UserPromptSubmit` hook remains useful as a later **non-interactive policy gate**, especially for a security processor, but it cannot implement transparent prompt replacement. A Codex plugin can package such a hook, yet packaging does not add a new hook result type. [OpenAI Hooks documentation](https://learn.chatgpt.com/docs/hooks#userpromptsubmit), [plugin hook discovery](https://learn.chatgpt.com/docs/hooks#where-codex-looks-for-hooks)

## Required v0.1 flow

```text
user types prompt
      │
      ▼
Correction Codex adapter
      │
      ├─ preserve non-text input items unchanged
      ├─ run configured local processor(s)
      └─ if text changed, show original/proposal/diff
                  │
           ┌──────┼────────┬─────────┐
           ▼      ▼        ▼         ▼
        approve  edit    bypass     cancel
           │      │        │         └─ send nothing
           └──────┴────────┘
                  │
                  ▼
     app-server turn/start(final input)
                  │
                  ▼
            main-model inference
```

For the prototype's `always` approval mode:

- **Approve** sends the proposal.
- **Edit** opens the proposal for user editing and sends the edited value after confirmation.
- **Bypass** sends the original value unchanged.
- **Cancel** does not call `turn/start`.

Because the decision happens before `turn/start`, the correction step itself consumes no main-model tokens; the main model sees one ordinary user message containing the chosen text. This conclusion follows from the documented fact that `turn/start` adds the input and begins generation, plus the Codex turn implementation, which records accepted hook-checked input before constructing and running the sampling request. [App Server turn API](https://learn.chatgpt.com/docs/app-server#start-a-turn), [Codex turn sequencing](https://github.com/openai/codex/blob/2cc9dbb9846b2dc03948414df6712adb967c70eb/codex-rs/core/src/session/turn.rs#L243-L248), [sampling request construction](https://github.com/openai/codex/blob/2cc9dbb9846b2dc03948414df6712adb967c70eb/codex-rs/core/src/session/turn.rs#L338-L375)

Correction should not persist the original, proposal, or diff. The selected final message is still subject to Codex's normal thread persistence; App Server defines items as persisted conversation input/output, while an explicitly ephemeral thread is held in memory and has no thread path. [App Server core primitives and thread lifecycle](https://github.com/openai/codex/blob/2cc9dbb9846b2dc03948414df6712adb967c70eb/codex-rs/app-server/README.md#L69-L83)

## Option comparison

| Option | Before main-model sampling? | Can replace prompt? | Can provide approve/edit/bypass? | Covers every interactive prompt? | Assessment |
| --- | --- | --- | --- | --- | --- |
| Native `UserPromptSubmit` hook | Yes | No | Only by blocking and asking the user to submit again | Yes, for prompts admitted by the Codex turn loop | Excellent gate; insufficient replacement UX |
| Plugin-bundled hook | Yes | No | Same limitation as the native hook | Yes when the plugin and hook are enabled/trusted | Distribution mechanism, not a stronger interception API |
| Skill or skills-only plugin | No independent preflight boundary | The main model can be instructed to rewrite, not replace before inference | Model-mediated only | Only when selected/invoked | Fails the token-saving goal |
| Shell/CLI wrapper | Yes for input the wrapper receives | Yes | Yes | Initial positional prompt or non-interactive jobs only; not later stock-TUI submissions | Useful test harness, not the Codex v0.1 adapter |
| Custom App Server client | Yes | Yes | Yes, entirely in the client before `turn/start` | Yes, for all turns submitted through that client | **Recommended** |
| App Server protocol proxy in front of stock TUI | In principle | In principle | No documented way to inject a custom approval modal into the stock TUI | Potentially | Too brittle for v0.1 |
| Responses/model-provider proxy | Too late in the host lifecycle | Can mutate the wire request | No native Codex approval UI | Sees model requests, not clean user-submit events | Not recommended |

## Native hooks

### What is supported

Codex describes hooks as deterministic scripts in the agent lifecycle and explicitly lists prompt scanning and secret blocking as a use case. `UserPromptSubmit` receives `prompt`, described as the user prompt about to be sent. Matching hooks are executed before accepted input is recorded and before the sampling request is built. [Hooks overview](https://learn.chatgpt.com/docs/hooks#hooks), [`UserPromptSubmit` input](https://learn.chatgpt.com/docs/hooks#userpromptsubmit), [runtime request construction](https://github.com/openai/codex/blob/2cc9dbb9846b2dc03948414df6712adb967c70eb/codex-rs/core/src/hook_runtime.rs#L538-L565), [turn ordering](https://github.com/openai/codex/blob/2cc9dbb9846b2dc03948414df6712adb967c70eb/codex-rs/core/src/session/turn.rs#L598-L634)

The supported `UserPromptSubmit` outcomes are:

- continue with no output;
- add text as extra developer context;
- stop/block with a reason, including exit status `2` plus a reason on `stderr`; or
- surface a warning through `systemMessage`.

There is no `updatedInput`, replacement prompt, or elicitation/approval result in the event's documented schema. By contrast, `PreToolUse` explicitly supports `updatedInput`, which confirms that rewriting exists for tool calls but was not exposed for submitted prompts. [`UserPromptSubmit` outputs](https://learn.chatgpt.com/docs/hooks#userpromptsubmit), [`PreToolUse` rewriting](https://learn.chatgpt.com/docs/hooks#pretooluse), [generated `UserPromptSubmit` output schema](https://github.com/openai/codex/blob/2cc9dbb9846b2dc03948414df6712adb967c70eb/codex-rs/hooks/schema/generated/user-prompt-submit.command.output.schema.json)

Therefore a correction hook can compute and display a proposal, then block the original prompt, but the user must submit a new message. It cannot atomically ask for approval and replace the already-submitted prompt. Adding the corrected text as `additionalContext` is not equivalent: it preserves the original user message, adds more model-visible tokens, and leaves conflicting original/corrected forms in context. Codex documents `additionalContext` as extra developer context and applies a model-visible output budget to it. [`additionalContext` semantics](https://learn.chatgpt.com/docs/hooks#userpromptsubmit), [large hook output](https://learn.chatgpt.com/docs/hooks#large-hook-output)

### Lifecycle and security limits

- Hooks are enabled by default in current Codex, and Codex discovers user and project hooks from `hooks.json` or inline `config.toml`; project hooks require the project layer to be trusted. [Hook locations and trust](https://learn.chatgpt.com/docs/hooks#where-codex-looks-for-hooks)
- Non-managed command hooks must be reviewed and trusted, and changes alter the trusted hash and require review again. [Hook review](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks)
- Only command handlers run currently; parsed `prompt` and `agent` hook handlers are skipped, so Correction should invoke its local runtime from a command hook if it later ships this integration. [Hook configuration notes](https://learn.chatgpt.com/docs/hooks#config-shape)
- All matching hooks run, and matching command hooks for one event launch concurrently. One hook cannot prevent another from starting. Consequently, a security hook can stop Codex inference but cannot guarantee that another installed prompt-observing hook did not already receive the raw prompt. Put ordered security processors inside one Correction pipeline when ordering matters. [Hook runtime behaviour](https://learn.chatgpt.com/docs/hooks#hooks)
- The transcript path is explicitly not a stable interface, so an adapter must not depend on parsing rollout files to recover or rewrite prompt state. [Common hook input fields](https://learn.chatgpt.com/docs/hooks#common-input-fields)

## Plugins and skills

Codex plugins are installable packages for skills and MCP servers, and Codex also discovers lifecycle hooks bundled by enabled plugins. A plugin-bundled `UserPromptSubmit` hook uses the same trust flow and the same event contract as any other hook; it gains packaging and installation, not replacement or interactive approval semantics. [Build plugins](https://learn.chatgpt.com/docs/build-plugins#build-plugins), [plugin-bundled hook behaviour](https://learn.chatgpt.com/docs/hooks#where-codex-looks-for-hooks), [first-party plugin hook loader](https://github.com/openai/codex/blob/2cc9dbb9846b2dc03948414df6712adb967c70eb/codex-rs/core-plugins/src/loader.rs#L1166-L1223)

A skill is unsuitable for the preflight path. Codex first places skill names/descriptions in model context, then reads full `SKILL.md` instructions when a skill is selected. Explicit App Server skill invocation also puts a skill item and `$skill-name` in the turn input. The large model must therefore receive and act on the skill, which is the token cost Correction is intended to avoid. [Skill context behaviour](https://learn.chatgpt.com/docs/build-skills#build-skills), [App Server skill invocation](https://learn.chatgpt.com/docs/app-server#start-a-turn-invoke-a-skill)

Packaging the eventual project as a Codex plugin may still be useful for installation, configuration help, or an optional security-blocking hook. The product's prompt-replacement mechanism, however, should be described internally as a **host adapter**, not as a skill.

## Wrappers

The CLI accepts an optional initial prompt, so a shell executable can locally transform that value, ask for approval, and then launch Codex with the selected text. This is a legitimate low-cost spike for the pipeline and approval UI. [Codex TUI CLI argument](https://github.com/openai/codex/blob/2cc9dbb9846b2dc03948414df6712adb967c70eb/codex-rs/tui/src/cli.rs)

A process wrapper does not receive prompts subsequently typed into the already-running stock Codex TUI. Covering every interactive message would require controlling or replacing the client boundary, which brings the design back to App Server. The wrapper should therefore be used only as a development harness or a one-shot `codex exec` adapter, not claimed as the full Codex integration.

Codex's remote mode allows the stock terminal UI to connect to App Server, so a JSON-RPC middleware could theoretically intercept `turn/start`. However, the documented protocol provides no extension point for middleware to insert an arbitrary pre-turn approval modal into the stock TUI; additionally, the App Server command and WebSocket transport are labelled experimental and unsupported for production. This makes a transparent stock-TUI proxy a poor v0.1 dependency. [Remote TUI mode and support status](https://learn.chatgpt.com/docs/app-server#connect-the-cli-terminal-ui)

## Model-provider proxy

Codex supports custom model providers with a configurable `base_url`, and the only supported custom-provider wire API is the Responses API. This makes a reverse proxy technically possible. [Custom provider configuration](https://learn.chatgpt.com/docs/config-file/advanced#custom-model-providers), [provider reference](https://learn.chatgpt.com/docs/config-file/config-reference#model_providersid)

It is the wrong boundary for Correction:

- it receives a constructed model request containing conversation history, instructions, tools, and current input rather than a clean host-level prompt-submit event;
- mutating only the network request can make the upstream model's view diverge from Codex's locally recorded conversation history; and
- the provider protocol has no documented way to request an approve/edit/bypass interaction from the Codex composer before the request proceeds.

Those conclusions are architectural inferences from the provider contract (base URL, authentication, headers, and Responses wire protocol) and from Codex constructing the sampling input from recorded history before invoking the model client. [Provider contract](https://learn.chatgpt.com/docs/config-file/config-reference#model_providersid), [sampling request construction](https://github.com/openai/codex/blob/2cc9dbb9846b2dc03948414df6712adb967c70eb/codex-rs/core/src/session/turn.rs#L350-L375)

## Recommended Codex adapter contract

The host-neutral core should expose a result resembling:

```text
process(text, context) ->
  unchanged
  | proposed { original, transformed, diagnostics, risk }
  | blocked { reason }
  | failed { error, fail_open }
```

The Codex adapter owns host lifecycle and user interaction:

1. Launch `codex app-server` as a child process over `stdio`.
2. Perform the required `initialize` / `initialized` handshake.
3. Start or resume a Codex thread.
4. For each outgoing text item, run the Correction pipeline locally.
5. In `always` mode, resolve approve/edit/bypass/cancel before any `turn/start` call.
6. Preserve image and local-image items exactly; submit only the selected text alongside them.
7. Send `turn/start` and stream item/turn notifications.
8. Forward Codex's server-initiated approval and input requests through the adapter UI.

The handshake, text/image/local-image input types, turn streaming, and server-initiated approvals are documented App Server responsibilities. [App Server getting started](https://learn.chatgpt.com/docs/app-server#getting-started), [turn input types](https://learn.chatgpt.com/docs/app-server#turns), [approval flows](https://learn.chatgpt.com/docs/app-server#approvals)

For compatibility, pin and test against a specific Codex CLI version in v0.1, use `stdio` rather than experimental WebSocket transport, and isolate all protocol types behind the Codex adapter. App Server is the documented deep-integration interface, but its command is still labelled experimental and not supported for production workloads; version isolation keeps that risk out of the host-neutral pipeline. [App Server status and transports](https://learn.chatgpt.com/docs/app-server#protocol)

## Acceptance checks for the prototype

- No App Server `turn/start` message is emitted while the proposal is awaiting approval.
- Approve sends only the transformed text; bypass sends byte-for-byte original text; cancel sends no turn.
- Edit sends exactly the user's edited text after confirmation.
- A processor timeout or failure follows configured fail-open behaviour and offers the original prompt.
- Code spans, URLs, paths, flags, commands, mentions, and non-text items survive unchanged.
- Correction logs contain timing/outcome metadata but no prompt content by default.
- The adapter handles a second and later interactive prompt, proving this is not merely an initial CLI wrapper.
- A protocol conformance test pins the supported Codex CLI version and exercises initialise, thread start/resume, turn start, streaming, and one Codex approval request.

## Deferred option

After the App Server prototype works, add an optional plugin-bundled `UserPromptSubmit` command hook for installations that prefer non-interactive security blocking in the stock Codex client. Treat it as a separate capability with a deliberately smaller contract: **allow, add context, or block**. Do not advertise it as an approval-based prompt replacer.
