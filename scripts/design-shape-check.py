#!/usr/bin/env python3
"""design-shape-check.py — a ledger row that QUOTES a definition's shape must quote it whole.

A row writes `#Name: {a, b}` when it says what a definition carries. That copy goes stale the moment the
definition grows or loses a field, and the citation check cannot see it: the citation still resolves, so
the gate stays green over prose that is no longer true (batch 21 shipped exactly that — `kind:kubernetes`
still said `#ClusterNode: {control_plane}` after the node grew two fields).

Reads a ledger and the schema, and prints one FAIL line per row whose quoted field set is not exactly the
definition's own. A bare citation (`DESIGN.cue:#Name`) and the `#Name is {a}` phrasing are not shape
quotes and are not checked here.

Usage:
  design-shape-check.py <ledger> <schema>   -- report rows whose quoted shape is stale
  design-shape-check.py --count <schema>    -- declared vs registered definitions, and fail if any is missed

The `--count` mode exists because a parser that quietly skips a definition fails in the SILENT direction:
a row quoting the skipped definition is never checked, and a green gate proves nothing. Counting the
schema's `^#Name:` lines against what the parser registered is the one check that makes the gap visible.
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
        # across lines (or nests) is captured whole and a one-line one is not over-read. The walk also
        # stops at the NEXT definition: a brace-less definition (`#Text: string`, `#Port: int & ...`)
        # must not consume the body of the braced one that follows it, or that one would be skipped and
        # every row quoting it would go unchecked (round 2 of batch 22).
        cursor = index
        while cursor < len(lines):
            if cursor > index and re.match(r"^#[A-Za-z0-9]+:", lines[cursor]):
                break
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
        # A walk that stopped ON the next definition has not consumed it: resume there, not past it.
        # A walk that ran off the end of the file (the last definition's brace never closes) must
        # stop instead of reading lines[len(lines)]: the cursor is one past the last line, and the
        # only legal move is out of the loop (opencharly/opencharly#921).
        index = cursor if (cursor > index and cursor < len(lines) and re.match(r"^#[A-Za-z0-9]+:", lines[cursor])) else cursor + 1
    return defs


def top_level_fields(body):
    """Field names at brace depth 1: a one-line body keeps them inline, a multi-line one indents them.

    Only the token immediately before a `:` is a field name. Everything after it is the VALUE, and a
    value that happens to be a bare identifier (`a: int`) is not a field of its own — round 5 of batch
    22 caught the extractor reading it as one.
    """
    fields, depth, buffer = set(), 0, ""
    in_value = False
    for char in body:
        if char == "{":
            depth += 1
            continue
        if char == "}":
            depth -= 1
            buffer, in_value = "", False
            continue
        if depth != 1:
            continue
        if char in "\n,":
            buffer, in_value = "", False
            continue
        if in_value:
            continue
        buffer += char
        if char == ":":
            match = re.match(r"\s*([a-z_][a-z0-9_]*)[!?]?:\s*$", buffer)
            if match:
                fields.add(match.group(1))
            buffer, in_value = "", True
    return fields


def count(argv):
    """Print declared / registered / missed for one schema, and fail when anything is missed."""
    if len(argv) != 3:
        print("usage: design-shape-check.py --count <schema>", file=sys.stderr)
        return 2
    schema = argv[2]
    text = open(schema, encoding="utf-8").read()
    declared = re.findall(r"^#([A-Za-z0-9]+):", text, re.M)
    defs = definition_fields(text)
    missed = [name for name in declared if name not in defs]
    print("declared %d | registered %d | missed %d" % (len(declared), len(defs), len(missed)))
    for name in missed:
        print("MISSED #%s" % name)
    return 1 if missed else 0


def main(argv):
    if len(argv) > 1 and argv[1] == "--count":
        return count(argv)
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
