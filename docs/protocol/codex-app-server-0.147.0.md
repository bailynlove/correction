# Codex App Server protocol pin

The vertical slice targets `codex-cli 0.147.0`. Regenerate the authoritative
bindings for a compatibility review with:

```sh
codex app-server generate-ts --out /tmp/codex-app-server-ts
codex app-server generate-json-schema --out /tmp/codex-app-server-json
```

The adapter uses newline-delimited JSON messages without a `jsonrpc` field:

1. request `initialize` with client identity and capabilities;
2. notify `initialized`;
3. request `thread/start`, or `thread/resume` with a thread ID;
4. request `turn/start` with `input: [{ type: "text", text, text_elements: [] }]`;
5. stream `item/agentMessage/delta` notifications;
6. finish on `turn/completed`.

The implemented server-to-client request subset is
`item/commandExecution/requestApproval` and
`item/fileChange/requestApproval`. Unknown server requests receive JSON-RPC
method-not-found and are a documented prototype limitation.
