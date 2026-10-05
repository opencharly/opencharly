# Ollama Cloud web search — Reasonix code extension

Gives a Reasonix session two model-callable tools backed by Ollama's REST API:

| Tool (as the model sees it) | Does |
|---|---|
| `ext__ollama-websearch__web_search` | `POST https://ollama.com/api/web_search` → ranked `title` / `url` / `content` |
| `ext__ollama-websearch__web_fetch` | `POST https://ollama.com/api/web_fetch` → page text + links |

## Why a code extension and not a provider flag

Reasonix *has* a provider-side web-search flag, but it is not available on this
endpoint. Measured against reasonix v2.28.0:

- The binary gates it to the official DeepSeek and OpenCode-Go-DeepSeek routes
  (`config.IsOfficialDeepSeekWebSearchEndpoint`,
  `config.IsOpenCodeGoDeepSeekWebSearchEndpoint`,
  `config.SupportsServerWebSearch`). **There is no Ollama-Cloud arm** — no
  `IsOllamaCloud*WebSearch` symbol exists.
- `web_search = true` is documented only for the DeepSeek / OpenCode-Go presets.
  The unsupported-route protocol error is `provider.no_websearch_wire`.
- Reasonix ships **no** `web_search` tool of its own (`web_fetch` only), and the
  Ollama Cloud preset is a *model-access* preset — thinking/effort, not search.

Ollama's own documentation makes search a separate REST API
(<https://docs.ollama.com/capabilities/web-search>) with the documented harness
integration being an MCP server. An MCP server cannot work here for the
credential reason below, so this is a code extension instead.

## Credentials

Resolved in this order, and never logged:

1. `OLLAMA_API_KEY` in the inherited environment. A code extension runs outside
   the Reasonix sandbox **with the unfiltered inherited environment**, so this
   is the normal path when the operator has exported the key.
2. `$REASONIX_HOME/.env` (default `~/.reasonix/.env`) — the documented store for
   provider keys. Read directly: the host's credential-hiding rules apply to its
   own file readers, sandboxed shell commands, and MCP children, **not** to a
   sidecar.
3. `.env` in the workspace, for a workspace-scoped key.

With no key reachable, the tool returns a readable `isError` result naming the
two places to put one — it never crashes the sidecar.

## Install — a per-machine step, not a repo setting

The package lives in this repository, but installing it is **global and
one-time**, exactly like `charly task hooks` or `reasonix trust`:

```bash
reasonix plugin install .reasonix/plugin --link --yes
```

`--link` keeps the installed plugin tied to this working directory, so edits
here take effect without reinstalling. `reasonix plugin install … --dry-run`
previews it first.

**This is not expressible as project configuration.** Reasonix's own rule:
*"Only plugins installed through the plugin flow can start a runtime; project
configuration can never declare one."* A `runtime` block in `reasonix.toml`
would be ignored. The install is also the authorization — the plan displays a
`FULL TRUST` block, because a sidecar can read the full session and environment
and operate the machine directly. Review that block before installing.

After installing, `/reload` while idle, then confirm with
`reasonix plugin doctor ollama-websearch`.

## Verifying without a key

The handshake and error paths are testable offline — this is the check the
harness-config gate's own self-test relies on:

```bash
cd .reasonix/plugin
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"extension/initialize","params":{"tools":["web_search","web_fetch"]}}' \
  '{"jsonrpc":"2.0","id":2,"method":"extension/tool/call","params":{"name":"web_search","arguments":{"query":"test"}}}' \
  '{"jsonrpc":"2.0","id":3,"method":"extension/shutdown","params":{}}' | ./sidecar.py
```

Expected: an `initialize` result naming both tools, a `tool/call` result that is
a readable `isError` when no key is present, and an empty `shutdown` result. An
undeclared tool name answers with a JSON-RPC error, not a tool failure.

## Wire contract

Reasonix Extension Protocol v2 (`reasonix.extension.v2`), JSON-RPC 2.0 over
stdio, newline-delimited:

| Direction | Method | Notes |
|---|---|---|
| host → sidecar | `extension/initialize` | reply names only manifest-declared tools |
| host → sidecar | `extension/initialized` | notification, no reply |
| host → sidecar | `extension/tool/call` | params: `name`, `arguments`, `timeoutMillis` |
| host → sidecar | `extension/shutdown` | reply, then exit |

A tool's own failure is `{"content": …, "isError": true}`; a call the extension
cannot run at all (an undeclared name) is a JSON-RPC `error` instead.

`sidecar.py` is Python **standard library only** — no build step, no vendored
dependency, no SDK checkout required.
