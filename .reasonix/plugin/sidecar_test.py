#!/usr/bin/env python3
"""Tests for the Ollama web-search code extension's sidecar.

Stdlib `unittest` only, like the sidecar itself.

WHAT THESE TESTS DO AND DO NOT CLAIM. The HTTP transport is STUBBED, so these
tests exercise THIS code — the handshake, the manifest boundary, argument
validation, result parsing and formatting — and never ollama.com. The live
service boundary is a SEPARATE, credential-gated probe documented in
`README.md`; it is not simulated here, so a passing run never claims the real
endpoint answered. The `_post` stub is installed only for the tests that need
it, so the validation and missing-key paths still run against the real code.

Run either way:
    python3 -m unittest discover -s .reasonix/plugin -p 'sidecar_test.py'
    python3 .reasonix/plugin/sidecar_test.py
"""

import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
SIDECAR = HERE / "sidecar.py"


def load_sidecar():
    """Import sidecar.py as a module (it is a script, not a package member)."""
    spec = importlib.util.spec_from_file_location("sidecar", SIDECAR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sidecar = load_sidecar()


class PostStub:
    """Replace `sidecar._post` for one test; restore on exit."""

    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def __enter__(self):
        self._real = sidecar._post
        self._key = sidecar.api_key
        sidecar._post = self._stub
        sidecar.api_key = lambda: "test-key"
        return self

    def _stub(self, path, payload, key):
        self.calls.append((path, payload, key))
        if path not in self.responses:
            raise AssertionError(f"unexpected endpoint {path!r}")
        return self.responses[path]

    def __exit__(self, *exc):
        sidecar._post = self._real
        sidecar.api_key = self._key
        return False


class TestHandshake(unittest.TestCase):
    def test_initialize_names_only_manifest_declared_tools(self):
        result = sidecar.handle_initialize({"tools": ["web_search", "web_fetch"]})
        self.assertEqual(result["protocolVersion"], "reasonix.extension.v2")
        self.assertEqual(result["capabilities"], ["tools"])
        self.assertEqual(result["tools"], ["web_search", "web_fetch"])

    def test_initialize_never_offers_a_tool_outside_the_manifest(self):
        # The host rejects any name beyond `runtime.tools` with
        # `capability_not_declared`, so the intersection is the correct answer.
        result = sidecar.handle_initialize({"tools": ["web_search", "evil"]})
        self.assertEqual(result["tools"], ["web_search"])

    def test_initialize_without_an_expectation_declares_both(self):
        self.assertEqual(sidecar.handle_initialize({})["tools"], sidecar.DECLARED_TOOLS)

    def test_undeclared_tool_is_a_protocol_error_not_a_tool_failure(self):
        # None signals the caller to answer with a JSON-RPC error (-32000),
        # because the extension cannot run the call at all.
        self.assertIsNone(sidecar.handle_tool_call({"name": "evil", "arguments": {}}))


class keyed:
    """Patch `api_key` for one test, so argument validation is reached.

    `handle_tool_call` resolves the key BEFORE running a handler (nothing can
    run without one), so a validation test must supply one to get past that
    gate. This patches only the key — never `_post` — so the validation path
    still runs against the real code.
    """

    def __enter__(self):
        self._real = sidecar.api_key
        sidecar.api_key = lambda: "test-key"
        return self

    def __exit__(self, *exc):
        sidecar.api_key = self._real
        return False


class TestArgumentValidation(unittest.TestCase):
    def test_web_search_rejects_an_empty_query(self):
        with keyed():
            result = sidecar.handle_tool_call({"name": "web_search", "arguments": {"query": "  "}})
        self.assertTrue(result["isError"])
        self.assertIn("non-empty 'query'", result["content"])

    def test_web_fetch_rejects_an_empty_url(self):
        with keyed():
            result = sidecar.handle_tool_call({"name": "web_fetch", "arguments": {"url": ""}})
        self.assertTrue(result["isError"])
        self.assertIn("non-empty 'url'", result["content"])

    def test_non_object_arguments_are_rejected(self):
        result = sidecar.handle_tool_call({"name": "web_search", "arguments": "not-an-object"})
        self.assertTrue(result["isError"])
        self.assertIn("must be an object", result["content"])

    def test_missing_key_is_a_readable_error_not_a_crash(self):
        real = sidecar.api_key
        sidecar.api_key = lambda: None
        try:
            result = sidecar.handle_tool_call({"name": "web_search", "arguments": {"query": "x"}})
        finally:
            sidecar.api_key = real
        self.assertTrue(result["isError"])
        self.assertIn("OLLAMA_API_KEY", result["content"])


class TestWebSearchSuccessPath(unittest.TestCase):
    """The success branch: request shape, result parsing, formatting."""

    RESPONSE = {
        "results": [
            {"title": "Ollama", "url": "https://ollama.com/", "content": "Cloud models are now available."},
            {"title": "", "url": "https://example.com/x", "content": "multi\nline   content"},
        ]
    }

    def test_formats_every_result_and_passes_the_query_through(self):
        with PostStub({"web_search": self.RESPONSE}) as stub:
            out = sidecar.web_search({"query": "  what is ollama  "}, "k")
        self.assertEqual(stub.calls[0][0], "web_search")
        self.assertEqual(stub.calls[0][1], {"query": "what is ollama"})  # stripped
        self.assertEqual(stub.calls[0][2], "k")  # the resolved key is forwarded
        self.assertIn("2 result(s)", out)
        self.assertIn("1. Ollama", out)
        self.assertIn("https://ollama.com/", out)
        self.assertIn("Cloud models are now available.", out)
        # An untitled result is labelled, and its content whitespace is collapsed.
        self.assertIn("(untitled)", out)
        self.assertIn("multi line content", out)

    def test_max_results_is_clamped_to_the_documented_ceiling(self):
        with PostStub({"web_search": {"results": []}}) as stub:
            sidecar.web_search({"query": "q", "max_results": 99}, "k")
        self.assertEqual(stub.calls[0][1]["max_results"], sidecar.MAX_RESULTS_CEILING)

    def test_max_results_is_omitted_when_not_supplied(self):
        with PostStub({"web_search": {"results": []}}) as stub:
            sidecar.web_search({"query": "q"}, "k")
        self.assertNotIn("max_results", stub.calls[0][1])

    def test_a_non_integer_max_results_is_rejected(self):
        with self.assertRaises(sidecar.ToolError):
            sidecar.web_search({"query": "q", "max_results": "many"}, "k")

    def test_zero_results_says_so_rather_than_printing_an_empty_list(self):
        with PostStub({"web_search": {"results": []}}):
            out = sidecar.web_search({"query": "nothing matches"}, "k")
        self.assertIn("No results", out)


class TestWebFetchSuccessPath(unittest.TestCase):
    """The success branch: title/content/links rendering."""

    RESPONSE = {
        "title": "Ollama",
        "content": "Cloud models are now available.",
        "links": ["https://ollama.com/", "https://github.com/ollama/ollama"],
    }

    def test_renders_title_content_and_links(self):
        with PostStub({"web_fetch": self.RESPONSE}) as stub:
            out = sidecar.web_fetch({"url": "https://ollama.com"}, "k")
        self.assertEqual(stub.calls[0][0], "web_fetch")
        self.assertEqual(stub.calls[0][1], {"url": "https://ollama.com"})
        self.assertIn("# Ollama", out)
        self.assertIn("Cloud models are now available.", out)
        self.assertIn("Links:", out)
        self.assertIn("- https://ollama.com/", out)

    def test_a_page_without_content_says_so(self):
        with PostStub({"web_fetch": {"title": "Empty", "content": "", "links": []}}):
            out = sidecar.web_fetch({"url": "https://example.com"}, "k")
        self.assertIn("(no readable content)", out)


class TestKeyResolution(unittest.TestCase):
    def test_inherited_environment_wins(self):
        old = os.environ.get("OLLAMA_API_KEY")
        os.environ["OLLAMA_API_KEY"] = "from-env"
        try:
            self.assertEqual(sidecar.api_key(), "from-env")
        finally:
            if old is None:
                os.environ.pop("OLLAMA_API_KEY", None)
            else:
                os.environ["OLLAMA_API_KEY"] = old

    def test_reasonix_home_dotenv_is_parsed(self):
        # The documented provider-key store: comments skipped, quotes stripped,
        # and only the OLLAMA_API_KEY line selected.
        with tempfile.TemporaryDirectory() as home:
            pathlib.Path(home, ".env").write_text(
                "# a comment\nOTHER=zzz\nOLLAMA_API_KEY=\"from-file\"\n", encoding="utf-8"
            )
            old_env = os.environ.pop("OLLAMA_API_KEY", None)
            old_home = os.environ.get("REASONIX_HOME")
            os.environ["REASONIX_HOME"] = home
            try:
                self.assertEqual(sidecar.api_key(), "from-file")
            finally:
                if old_home is None:
                    os.environ.pop("REASONIX_HOME", None)
                else:
                    os.environ["REASONIX_HOME"] = old_home
                if old_env is not None:
                    os.environ["OLLAMA_API_KEY"] = old_env

    def test_no_key_anywhere_returns_none(self):
        with tempfile.TemporaryDirectory() as home:
            old_env = os.environ.pop("OLLAMA_API_KEY", None)
            old_home = os.environ.get("REASONIX_HOME")
            os.environ["REASONIX_HOME"] = home  # no .env inside
            try:
                self.assertIsNone(sidecar.api_key())
            finally:
                if old_home is None:
                    os.environ.pop("REASONIX_HOME", None)
                else:
                    os.environ["REASONIX_HOME"] = old_home
                if old_env is not None:
                    os.environ["OLLAMA_API_KEY"] = old_env


class TestStdioLoop(unittest.TestCase):
    """Drive the real process over stdin/stdout — the actual wire contract."""

    def _run(self, lines, env=None):
        proc = subprocess.run(
            [sys.executable, str(SIDECAR)],
            input="".join(json.dumps(l) + "\n" for l in lines),
            capture_output=True,
            text=True,
            timeout=60,
            env={**os.environ, **(env or {})},
        )
        return [json.loads(l) for l in proc.stdout.splitlines() if l.strip()]

    def test_handshake_undeclared_tool_and_shutdown(self):
        out = self._run([
            {"jsonrpc": "2.0", "id": 1, "method": "extension/initialize", "params": {"tools": ["web_search", "web_fetch"]}},
            {"jsonrpc": "2.0", "method": "extension/initialized", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "extension/tool/call", "params": {"name": "evil", "arguments": {}}},
            {"jsonrpc": "2.0", "id": 3, "method": "extension/shutdown", "params": {}},
        ])
        self.assertEqual(out[0]["result"]["tools"], ["web_search", "web_fetch"])
        self.assertEqual(out[1]["error"]["code"], -32000)  # undeclared tool
        self.assertEqual(out[2]["result"], {})  # shutdown
        # `extension/initialized` is a notification: no id, so no reply.
        self.assertEqual(len(out), 3)

    def test_unknown_method_with_an_id_is_method_not_found(self):
        out = self._run([{"jsonrpc": "2.0", "id": 9, "method": "extension/nope", "params": {}}])
        self.assertEqual(out[0]["error"]["code"], -32601)

    def test_a_malformed_frame_is_dropped_not_fatal(self):
        proc = subprocess.run(
            [sys.executable, str(SIDECAR)],
            input="not json\n" + json.dumps({"jsonrpc": "2.0", "id": 1, "method": "extension/shutdown", "params": {}}) + "\n",
            capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(json.loads(proc.stdout.strip())["result"], {})

    def test_no_key_yields_a_readable_tool_error_over_the_wire(self):
        env = {k: v for k, v in os.environ.items() if k != "OLLAMA_API_KEY"}
        with tempfile.TemporaryDirectory() as home:
            env["REASONIX_HOME"] = home  # no .env → no key
            out = self._run(
                [{"jsonrpc": "2.0", "id": 1, "method": "extension/tool/call",
                  "params": {"name": "web_search", "arguments": {"query": "x"}}}],
                env=env,
            )
        self.assertTrue(out[0]["result"]["isError"])
        self.assertIn("OLLAMA_API_KEY", out[0]["result"]["content"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
