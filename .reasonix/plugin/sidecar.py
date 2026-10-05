#!/usr/bin/env python3
"""Ollama Cloud web search + web fetch, as a Reasonix code extension (sidecar).

WHY THIS EXISTS
    Reasonix has no provider-side web search for the `ollama-cloud` endpoint.
    The `web_search = true` provider flag is real, but the binary gates it to
    the official DeepSeek and OpenCode-Go-DeepSeek routes
    (`config.IsOfficialDeepSeekWebSearchEndpoint`,
    `config.IsOpenCodeGoDeepSeekWebSearchEndpoint`,
    `config.SupportsServerWebSearch`); there is no Ollama-Cloud arm, and the
    protocol error for an unsupported route is `provider.no_websearch_wire`.
    Ollama instead exposes web search as its OWN REST API
    (https://docs.ollama.com/capabilities/web-search):

        POST https://ollama.com/api/web_search   {query, max_results}
        POST https://ollama.com/api/web_fetch    {url}

    This sidecar serves those two calls as model-callable tools.

PROTOCOL
    Reasonix Extension Protocol v2 (`reasonix.extension.v2`), JSON-RPC 2.0 over
    stdio, newline-delimited. The host:
      1. spawns this process (exec form) and sends `extension/initialize`;
      2. validates the reply against the host's registered `InitializeResult`
         and the manifest — `name`, `version`, `stateSchemaVersion` and
         `protocolVersion` are REQUIRED, any unregistered field is REJECTED,
         and every tool named in `InitializeResult.tools` must be declared
         under `runtime.tools`;
      3. sends `extension/initialized` (no reply);
      4. calls `extension/tool/call` per invocation;
      5. ends with `extension/shutdown`.
    A reply is `{"jsonrpc":"2.0","id":<id>,"result":...}`; a protocol error is
    `{"jsonrpc":"2.0","id":<id>,"error":{"code":...,"message":...}}`.

    The `InitializeResult` shape is the host's, not this file's, to define: it
    is MEASURED against the installed host (v2.28.0) in `README.md` "Wire
    contract" and locked by `sidecar_test.py::TestHandshake` plus the offline
    handshake assertion in `scripts/check-harness-config.mjs`. Do not add fields
    to the reply — the host decodes strictly and rejects an unknown field.

CREDENTIALS — in this order
    1. `OLLAMA_API_KEY` in the inherited environment. A code extension runs
       outside the Reasonix sandbox with the unfiltered inherited environment,
       so this is the normal path when the operator has exported the key.
    2. The Reasonix home `.env` (`$REASONIX_HOME/.env`, default
       `~/.reasonix/.env`), the documented store for provider keys. Read
       directly, because the host's own credential-hiding rules apply to its
       file readers and MCP children, not to a sidecar.
    3. A project `.env` in the workspace, for a workspace-scoped key.
    The key is never logged and never echoed into a tool result.

Stdlib only: no build step, no vendored dependency.
"""

import json
import os
import sys
import urllib.error
import urllib.request

PROTOCOL_ID = "reasonix.extension.v2"
# The wire VALUE of `protocolVersion`. It is the numeric MAJOR as a string, NOT
# the protocol ID — the host rejects `"reasonix.extension.v2"` here with
# `protocol error`, and rejects `3`/`"3"` with `unsupported_version` (MEASURED).
PROTOCOL_VERSION = "2"
MANIFEST_NAME = "ollama-websearch"
MANIFEST_VERSION = "1.0.0"
# The host's `stateSchemaVersion` is a required integer (validate:"min=0"). This
# extension keeps no state, so 0 is the correct value.
STATE_SCHEMA_VERSION = 0
API_BASE = "https://ollama.com/api"
# The manifest's declared tools. The host rejects any name returned from
# `extension/initialize` that is not in `runtime.tools`, so this list is the
# manifest's list and nothing else.
DECLARED_TOOLS = ["web_search", "web_fetch"]
HTTP_TIMEOUT_SECONDS = 30
MAX_RESULTS_CEILING = 10


# ── credentials ───────────────────────────────────────────────────────────────

def _env_file_key(path):
    """Return the OLLAMA_API_KEY value from a dotenv-style file, or None."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                name, _, value = line.partition("=")
                if name.strip() != "OLLAMA_API_KEY":
                    continue
                value = value.strip().strip('"').strip("'")
                return value or None
    except OSError:
        return None
    return None


def api_key():
    """Resolve the Ollama API key, or None. Never logs the value."""
    key = os.environ.get("OLLAMA_API_KEY", "").strip()
    if key:
        return key
    home = os.environ.get("REASONIX_HOME") or os.path.join(
        os.path.expanduser("~"), ".reasonix"
    )
    for candidate in (
        os.path.join(home, ".env"),
        os.path.join(os.getcwd(), ".env"),
    ):
        key = _env_file_key(candidate)
        if key:
            return key
    return None


# ── Ollama REST ───────────────────────────────────────────────────────────────

class ToolError(Exception):
    """A failure the TOOL reports about its own work (ToolCallResult.isError)."""


def _post(path, payload, key):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{API_BASE}/{path}",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # Never surface the request headers; the status and body are enough.
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:400]
        except Exception:
            pass
        raise ToolError(f"ollama.com returned HTTP {exc.code}{': ' + detail if detail else ''}")
    except urllib.error.URLError as exc:
        raise ToolError(f"could not reach ollama.com: {exc.reason}")
    except (TimeoutError, json.JSONDecodeError) as exc:
        raise ToolError(f"ollama.com response was unusable: {exc}")


def web_search(args, key):
    query = args.get("query")
    if not isinstance(query, str) or not query.strip():
        raise ToolError("web_search requires a non-empty 'query' string")
    payload = {"query": query.strip()}
    raw_max = args.get("max_results")
    if raw_max is not None:
        try:
            max_results = int(raw_max)
        except (TypeError, ValueError):
            raise ToolError("'max_results' must be an integer")
        if max_results < 1:
            raise ToolError("'max_results' must be at least 1")
        payload["max_results"] = min(max_results, MAX_RESULTS_CEILING)

    data = _post("web_search", payload, key)
    results = data.get("results") or []
    if not results:
        return f"No results for {query!r}."

    lines = [f"{len(results)} result(s) for {query!r}:"]
    for i, item in enumerate(results, 1):
        title = (item.get("title") or "").strip() or "(untitled)"
        url = (item.get("url") or "").strip()
        content = " ".join((item.get("content") or "").split())
        lines.append(f"\n{i}. {title}\n   {url}\n   {content}")
    return "\n".join(lines)


def web_fetch(args, key):
    url = args.get("url")
    if not isinstance(url, str) or not url.strip():
        raise ToolError("web_fetch requires a non-empty 'url' string")
    data = _post("web_fetch", {"url": url.strip()}, key)
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    links = data.get("links") or []
    parts = []
    if title:
        parts.append(f"# {title}")
    parts.append(content or "(no readable content)")
    if links:
        parts.append("\nLinks:\n" + "\n".join(f"- {u}" for u in links[:50]))
    return "\n\n".join(parts)


HANDLERS = {"web_search": web_search, "web_fetch": web_fetch}


# ── JSON-RPC plumbing ─────────────────────────────────────────────────────────

def send(message):
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def reply(req_id, result):
    send({"jsonrpc": "2.0", "id": req_id, "result": result})


def fail(req_id, code, message):
    send({"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}})


def handle_initialize(params):
    """Answer the handshake with the host's registered `InitializeResult`.

    The host decodes the result STRICTLY: `name`, `version`,
    `stateSchemaVersion` and `protocolVersion` are required, and any
    unregistered field (`capabilities` among them) is rejected with
    `params do not match the registered type` — MEASURED on reasonix v2.28.0.
    Only manifest-declared tools may be named.

    The host sends its tool expectation under `params.manifest.tools`; the
    bare `params.tools` fallback is kept for the offline/direct invocation
    documented in README.md. Names outside the manifest would fail the
    handshake with `capability_not_declared`, so the intersection is the
    answer when the host names a subset, and the full declared set when it
    names none.
    """
    manifest = params.get("manifest")
    manifest = manifest if isinstance(manifest, dict) else {}
    expectation = manifest.get("tools")
    if not (isinstance(expectation, list) and expectation):
        expectation = params.get("tools")
    if isinstance(expectation, list) and expectation:
        accepted = [t for t in DECLARED_TOOLS if t in expectation]
    else:
        accepted = list(DECLARED_TOOLS)
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "name": MANIFEST_NAME,
        "version": MANIFEST_VERSION,
        "stateSchemaVersion": STATE_SCHEMA_VERSION,
        "tools": accepted,
    }


def handle_tool_call(params):
    name = params.get("name")
    args = params.get("arguments") or {}
    if not isinstance(args, dict):
        return {"content": "tool arguments must be an object", "isError": True}
    handler = HANDLERS.get(name)
    if handler is None:
        # A name outside the manifest is a protocol error, not a tool failure.
        return None
    key = api_key()
    if not key:
        return {
            "content": (
                "OLLAMA_API_KEY is not available. Set it in the environment, or in "
                "$REASONIX_HOME/.env (default ~/.reasonix/.env), then restart the session."
            ),
            "isError": True,
        }
    try:
        return {"content": handler(args, key), "isError": False}
    except ToolError as exc:
        return {"content": str(exc), "isError": True}
    except Exception as exc:  # never let a handler kill the sidecar
        return {"content": f"unexpected tool failure: {exc}", "isError": True}


def serve():
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue  # a malformed frame is dropped, never fatal
        method = msg.get("method")
        req_id = msg.get("id")
        params = msg.get("params") or {}

        if method == "extension/initialize":
            reply(req_id, handle_initialize(params))
        elif method == "extension/tool/call":
            result = handle_tool_call(params)
            if result is None:
                fail(req_id, -32000, f"tool {params.get('name')!r} is not declared by this extension")
            else:
                reply(req_id, result)
        elif method == "extension/shutdown":
            reply(req_id, {})
            return
        elif req_id is not None:
            # Notifications (extension/initialized, extension/event, …) carry no
            # id and need no reply; anything else with an id is unknown.
            fail(req_id, -32601, f"method not found: {method}")


if __name__ == "__main__":
    serve()
