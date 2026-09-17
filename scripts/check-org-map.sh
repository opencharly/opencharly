#!/usr/bin/env bash
# check-org-map.sh — verify the README's "## The org map" tables against the repo
# and against `.gitmodules`. Three assertions, since none of the pinning gates
# reads README prose:
#
#   1. every `### <section>`'s claimed `N repos` equals its own table row count
#   2. every section's table rows are in ascending path order
#   3. every submodule in `.gitmodules` has a row, and the header's
#      "every OpenCharly repo (N today)" equals the `.gitmodules` submodule count
#
# Usage: scripts/check-org-map.sh [git-ref]     (default: the working tree README)
#
# The ref form reads `<ref>:README.md` + `<ref>:.gitmodules`, so the same script
# can check the base and the head for comparison.
set -euo pipefail

ref="${1:-}"

python3 - "$ref" <<'PY'
import re
import subprocess
import sys

ref = sys.argv[1] if len(sys.argv) > 1 else ""


def read(path):
    if ref:
        return subprocess.run(
            ["git", "show", f"{ref}:{path}"], capture_output=True, text=True, check=True
        ).stdout
    return open(path).read()


readme = read("README.md")
gitmodules = read(".gitmodules")

body = readme[readme.index("## The org map") : readme.index("## Pinning")]
sections = re.split(r"\n(?=### )", body)[1:]

fail = 0
print(f"{'section':26s} {'claimed':>7s} {'rows':>5s} {'sorted':>7s}")
for sec in sections:
    name = sec.split("\n", 1)[0].strip()
    rows = re.findall(r"^\| `([^/]+)/`", sec, re.M)
    claimed_m = re.search(r"^(\d+) repos", sec, re.M)
    claimed = int(claimed_m.group(1)) if claimed_m else -1
    sorted_ok = rows == sorted(rows)
    ok = len(rows) == claimed and sorted_ok
    fail += 0 if ok else 1
    print(f"{name:26s} {claimed:7d} {len(rows):5d} {'yes' if sorted_ok else 'NO':>7s}")

mods = re.findall(r'^\[submodule "([^"]+)"\]', gitmodules, re.M)
rowpaths = set(re.findall(r"^\| `([^/]+)/`", body, re.M))
missing = [m for m in mods if m not in rowpaths]
hdr_m = re.search(r"every OpenCharly repo \((\d+) today\)", readme)
hdr = hdr_m.group(1) if hdr_m else "?"

print()
print(f"submodules in .gitmodules : {len(mods)}")
print(f"submodules with no row    : {missing if missing else 'none'}")
print(f"header '(N today)'        : {hdr}  matches={hdr == str(len(mods))}")

if fail or missing or hdr != str(len(mods)):
    print(f"\nFAIL: {fail} section(s) mismatched, {len(missing)} rowless, header={hdr}")
    sys.exit(1)
print("\nOK: all sections reconcile and are sorted; every submodule has a row")
PY
