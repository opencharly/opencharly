#!/usr/bin/env python3
"""org-map.py — the ONE reconciliation of the README's "## The org map" against `.gitmodules`.

WHY BOTH DIRECTIONS (opencharly/opencharly#1030). The README's tables and `.gitmodules` are
two halves of ONE set: the tables are the INVENTORY of what the umbrella pins, the manifest is
the DECLARATION of it. Checking one direction only — "every submodule has a row" — passes over
the other half's defect: a row advertising a repo the umbrella does NOT pin. That is exactly
the state a retirement produces (the pins go, the prose stays), and it is also what a rename
leaves behind when it sweeps the gitlinks and not the org map. Both directions are findings
now, so a cutover that moves both halves and a change that moves only one are judged by the
same arms.

THE FIVE ARMS
  A0 anchors          README.md carries both `## The org map` and `## Pinning`
  A1 section claim    each `### <section>` states `N repos` and lists exactly N rows
  A2 section order    a section's rows are sorted (the map is read as an inventory)
  A3 submodule→row    every `[submodule "p"]` has a row `| `p/` |`
  A4 row→submodule    every row's path is a declared `[submodule "p"]`   <- the arm #1030 missed
  A5 header census    `every OpenCharly repo (N today)` == the declared-path count

Every arm is proved to FAIL on its OWN mutation by `--self-test`, and the clean fixture is
proved to pass in the same run: a reconciliation that cannot go RED is not a control.

USAGE
  python3 scripts/org-map.py [<root>]     check a tree (default: the current directory)
  python3 scripts/org-map.py --self-test  prove every arm turns RED on its own mutation
"""
import re
import sys
import tempfile
from pathlib import Path

ROW_RE = re.compile(r"^\| `([^/]+)/`", re.M)
CLAIM_RE = re.compile(r"^(\d+) repos", re.M)
SUB_RE = re.compile(r'^\[submodule "([^"]+)"\]', re.M)
HEADER_RE = re.compile(r"every OpenCharly repo \((\d+) today\)")

MAP_START = "## The org map"
MAP_END = "## Pinning"


def check(root):
    """Every finding as (arm, message). An empty list means the map and the manifest agree."""
    root = Path(root)
    try:
        readme = (root / "README.md").read_text()
        gitmodules = (root / ".gitmodules").read_text()
    except OSError as exc:
        return [("A0 anchors", f"cannot read {exc.filename}: {exc.strerror}")]

    try:
        body = readme[readme.index(MAP_START):readme.index(MAP_END)]
    except ValueError:
        return [("A0 anchors", f"README.md carries both `{MAP_START}` and `{MAP_END}` — it does not")]

    findings = []
    sections = re.split(r"\n(?=### )", body)[1:]

    # A1 + A2, per section.
    for sec in sections:
        name = sec.split("\n", 1)[0].strip()
        rows = ROW_RE.findall(sec)
        claimed_m = CLAIM_RE.search(sec)
        if claimed_m is None:
            findings.append(("A1 section claim", f"{name}: states no `N repos` claim"))
        else:
            claimed = int(claimed_m.group(1))
            if claimed != len(rows):
                findings.append(
                    ("A1 section claim", f"{name}: claims {claimed} repos and lists {len(rows)} row(s)")
                )
        if rows != sorted(rows):
            at = next(i for i in range(len(rows) - 1) if rows[i] > rows[i + 1])
            findings.append(
                ("A2 section order", f"{name}: rows are not sorted ({rows[at]!r} precedes {rows[at + 1]!r})")
            )

    declared = SUB_RE.findall(gitmodules)
    declared_set = set(declared)
    rows = ROW_RE.findall(body)
    row_set = set(rows)

    # A3: the declaration must be documented.
    for mod in declared:
        if mod not in row_set:
            findings.append(("A3 submodule→row", f"`.gitmodules` declares {mod!r} and no section has a row for it"))

    # A4: the documentation must be a declaration. This is the arm #1030 missed.
    for row in rows:
        if row not in declared_set:
            findings.append(
                ("A4 row→submodule", f"the org map carries a row for {row!r} and `.gitmodules` does not declare it")
            )

    # A5: the census beside the map.
    header_m = HEADER_RE.search(readme)
    if header_m is None:
        findings.append(("A5 header census", "README.md carries no `every OpenCharly repo (N today)` figure"))
    elif header_m.group(1) != str(len(declared)):
        findings.append(
            (
                "A5 header census",
                f"the header says ({header_m.group(1)} today) and `.gitmodules` declares {len(declared)} path(s)",
            )
        )
    return findings


def report(root):
    findings = check(root)
    root = Path(root)
    readme = (root / "README.md").read_text()
    gitmodules = (root / ".gitmodules").read_text()

    body = readme[readme.index(MAP_START):readme.index(MAP_END)]
    print(f"{'section':34s} {'claimed':>7s} {'rows':>5s} {'sorted':>7s}")
    for sec in re.split(r"\n(?=### )", body)[1:]:
        name = sec.split("\n", 1)[0].strip()
        rows = ROW_RE.findall(sec)
        claimed_m = CLAIM_RE.search(sec)
        claimed = int(claimed_m.group(1)) if claimed_m else -1
        print(f"{name:34s} {claimed:7d} {len(rows):5d} {'yes' if rows == sorted(rows) else 'NO':>7s}")

    mods = SUB_RE.findall(gitmodules)
    rows = ROW_RE.findall(body)
    header_m = HEADER_RE.search(readme)
    header = header_m.group(1) if header_m else "?"
    print()
    print(f"submodules in .gitmodules : {len(mods)}")
    print(f"rows in the org map       : {len(rows)}")
    print(f"submodules with no row    : {sorted(set(mods) - set(rows)) or 'none'}")
    print(f"rows with no submodule    : {sorted(set(rows) - set(mods)) or 'none'}")
    print(f"header '(N today)'        : {header}  matches={header == str(len(mods))}")

    if findings:
        print()
        for arm, message in findings:
            print(f"FAIL {arm}: {message}")
        print(f"\nFAIL: {len(findings)} finding(s)")
        return 1
    print("\nOK: both directions reconcile, every section is sorted, and the census matches")
    return 0


# ── the self-test: every arm turns RED on its own mutation ──────────────────────────────────

FIXTURE_README = """# fixture

## The org map

Intro prose, which the anchors bracket.

### Core & contract

2 repos — two of them.

| path | repo | role |
|---|---|---|
| `alpha/` | a | first |
| `beta/` | b | second |


### Plugins

1 repos — one of them.

| path | repo | role |
|---|---|---|
| `gamma/` | g | third |


## Pinning

and every OpenCharly repo (3 today) is pinned here.
"""

FIXTURE_GITMODULES = """[submodule "alpha"]
\tpath = alpha
\turl = https://example.invalid/alpha.git
[submodule "beta"]
\tpath = beta
\turl = https://example.invalid/beta.git
[submodule "gamma"]
\tpath = gamma
\turl = https://example.invalid/gamma.git
"""


def _tree(root, readme=FIXTURE_README, gitmodules=FIXTURE_GITMODULES):
    root = Path(root)
    (root / "README.md").write_text(readme)
    (root / ".gitmodules").write_text(gitmodules)
    return root


def _arms(findings):
    return sorted({arm for arm, _ in findings})


def self_test():
    """Fire each arm on ITS OWN mutation, and prove the clean fixture stays GREEN."""
    failures = 0

    def arm(label, expected, readme=FIXTURE_README, gitmodules=FIXTURE_GITMODULES):
        nonlocal failures
        with tempfile.TemporaryDirectory(prefix="org-map-") as tmp:
            got = _arms(check(_tree(tmp, readme, gitmodules)))
        ok = got == expected
        failures += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  {label}: arms={got} expected={expected}")

    # the clean fixture: the control must NOT fire on a tree that agrees with itself.
    with tempfile.TemporaryDirectory(prefix="org-map-") as tmp:
        clean = check(_tree(tmp))
    ok = clean == []
    failures += 0 if ok else 1
    print(f"  {'PASS' if ok else 'FAIL'}  a tree that agrees with itself is GREEN: findings={clean}")

    arm(
        "A0 — no `## Pinning` anchor",
        ["A0 anchors"],
        readme=FIXTURE_README.replace("## Pinning", "## Something else"),
    )
    arm(
        "A1 — a section claims more rows than it lists",
        ["A1 section claim"],
        readme=FIXTURE_README.replace("2 repos — two of them.", "3 repos — two of them."),
    )
    arm(
        "A2 — two rows out of order",
        ["A2 section order"],
        readme=FIXTURE_README.replace(
            "| `alpha/` | a | first |\n| `beta/` | b | second |",
            "| `beta/` | b | second |\n| `alpha/` | a | first |",
        ),
    )
    arm(
        "A3 — a submodule with no row (header kept honest)",
        ["A3 submodule→row"],
        readme=FIXTURE_README.replace("(3 today)", "(4 today)"),
        gitmodules=FIXTURE_GITMODULES + '[submodule "delta"]\n\tpath = delta\n',
    )
    arm(
        "A4 — a row with no submodule (the arm #1030 missed)",
        ["A4 row→submodule"],
        readme=FIXTURE_README.replace("1 repos — one of them.", "2 repos — one of them.").replace(
            "| `gamma/` | g | third |",
            "| `delta/` | d | stale |\n| `gamma/` | g | third |",
        ),
    )
    arm(
        "A5 — the header census is stale",
        ["A5 header census"],
        readme=FIXTURE_README.replace("(3 today)", "(4 today)"),
    )

    # A6: the control must have a CALLER. A gate nobody runs cannot notice that it is wrong,
    # which is exactly how the missing direction survived (opencharly/opencharly#1030). The
    # shipped pre-commit hook is that caller, and this arm fails if the leg is removed.
    hook = Path(__file__).resolve().parents[1] / "hooks" / "pre-commit"
    hook_text = hook.read_text() if hook.is_file() else ""
    # ANCHORED to the CALL SITE, never a bare substring: the hook's own header block NAMES
    # `scripts/org-map.py` in prose, so a substring test passes with the leg deleted — the
    # unanchored-predicate defect this skill's instrument checklist names. A commented or
    # prose line cannot match, because the comparison is a stripped line that must START
    # with the command.
    call = 'python3 "$ROOT/scripts/org-map.py"'
    ok = any(line.strip().startswith(call) for line in hook_text.splitlines())
    failures += 0 if ok else 1
    print(f"  {'PASS' if ok else 'FAIL'}  A6 — the shipped `hooks/pre-commit` runs this control (a caller exists)")

    if failures:
        print(f"\nFAIL: {failures} self-test arm(s) did not behave")
        return 1
    print("\nOK: every arm turns RED on its own mutation, the clean tree stays GREEN,")
    print("    and the control still has its caller")
    return 0


def main(argv):
    args = argv[1:]
    if args and args[0] == "--self-test":
        return self_test()
    return report(args[0] if args else ".")


if __name__ == "__main__":
    sys.exit(main(sys.argv))
