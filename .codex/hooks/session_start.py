#!/usr/bin/env python3
"""Add the umbrella identity and Codex profile guidance to each Codex session."""

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    try:
        soul = (ROOT / "SOUL.md").read_text(encoding="utf-8")
        instructions = (ROOT / ".codex/instructions.md").read_text(encoding="utf-8")
    except OSError as exc:
        print(f"codex SessionStart context unavailable: {exc}", file=sys.stderr)
        return 1

    context = "# OpenCharly identity (SOUL.md)\n\n" + soul
    context += "\n\n# Codex profile instructions\n\n" + instructions
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        }
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
