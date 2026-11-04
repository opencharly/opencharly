#!/usr/bin/env python3
"""design-shape-check.py — a ledger row that QUOTES a definition's shape must quote it whole.

A row writes `#Name: {a, b}` when it says what a definition carries. That copy goes stale the moment the
definition grows or loses a field, and the citation check cannot see it: the citation still resolves, so
the gate stays green over prose that is no longer true (batch 21 shipped exactly that — `kind:kubernetes`
still said `#ClusterNode: {control_plane}` after the node grew two fields).

Reads a ledger and the schema, and prints one FAIL line per row whose quoted field set is not exactly the
definition's own. A bare citation (`DESIGN.cue:#Name`) and the `#Name is {a}` phrasing are not shape
quotes and are not checked here.

Usage: design-shape-check.py <ledger> <schema>
"""
import re
import sys

def definition_fields(schema_text):
    """Top-level field names of every top-level `#Name: { ... }` definition, by brace depth."""
    defs = {}
    lines = schema_text.splitlines()
    index = 0
    while index < len(lines):
        match = re.match(r"^#([A-Za-z0-9]+):\s*(.*)$", lines[index])
        if not match:
            index += 1
            continue
        name, rest = match.group(1), match.group(2)
        body, depth = [], 0
        opened = False
        # Walk forward until the opening brace's depth returns to zero, so a definition that spills
        # across lines (or nests) is captured whole and a one-line one is not over-read.
        cursor = index
        while cursor < len(lines):
            text = lines[cursor] if cursor > index else rest
            for char in text:
                if char == "{":
                    depth += 1
                    opened = True
                elif char == "}":
                    depth -= 1
            if opened:
                body.append(text)
                if depth <= 0:
                    break
            cursor += 1
        defs[name] = top_level_fields("\n".join(body))
        index = cursor + 1
    return defs


def top_level_fields(body):
    """Field names at brace depth 1: a one-line body keeps them inline, a multi-line one indents them."""
    fields, depth, buffer = set(), 0, ""
    for char in body:
        if char == "{":
            depth += 1
            continue
        if char == "}":
            depth -= 1
            buffer = ""
            continue
        if depth == 1:
            buffer += char
            if char in "\n,:":
                match = re.match(r"\s*([a-z_][a-z0-9_]*)[!?]?:?\s*$", buffer)
                if match:
                    fields.add(match.group(1))
                buffer = ""
    return fields


def main(argv):
    if len(argv) != 3:
        print("usage: design-shape-check.py <ledger> <schema>", file=sys.stderr)
        return 2
    ledger, schema = argv[1], argv[2]
    defs = definition_fields(open(schema, encoding="utf-8").read())
    findings = 0
    with open(ledger, encoding="utf-8") as handle:
        for number, line in enumerate(handle, 1):
            if line.startswith("#"):
                continue
            for match in re.finditer(r"#([A-Za-z0-9]+):\s*\{([^}]*)\}", line):
                name, quoted = match.group(1), match.group(2)
                if name not in defs:
                    continue
                got = {f.strip().rstrip("!?") for f in quoted.split(",") if f.strip()}
                if got != defs[name]:
                    print(
                        "FAIL %s:%d: %s is quoted as {%s} but DESIGN.cue defines {%s}"
                        % (
                            ledger,
                            number,
                            name,
                            ", ".join(sorted(got)),
                            ", ".join(sorted(defs[name])),
                        )
                    )
                    findings += 1
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
