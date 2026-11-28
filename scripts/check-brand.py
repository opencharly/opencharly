#!/usr/bin/env python3
"""check-brand.py — every BRAND surface carries the canonical tagline, and no retired
brand phrase survives anywhere in the surface set.

WHY THIS EXISTS (opencharly/opencharly#1187). The product has had FIVE taglines —
"wonky DevOps orchestrator", "wonky DevOps tool", "The fully equipped factory floor",
"the open infrastructure compiler", "the agentic DevOps tool". Each rename swept the
string in the repositories its author remembered. MEASURED on 2026-11-27, TWO renames
after "wonky" was retired: the docs site's own meta description still shipped
"The wonky DevOps tool for you and your agents." (`docs/astro.config.mjs:15`), the docs
README still said "the open infrastructure compiler", the marketplace README and three
package repos still said "the fully equipped factory floor", and a stale DUPLICATE of the
packaging description sat in `layer-charly`. A sweep written in a PR body is not a
control: nothing in the repository runs it, so the next surface — a new README, a new
config description — is missed the same way, by the same mechanism.

THE ARMS
  A0 register         `brand/surfaces.tsv` parses: 3 columns, no duplicate (repo, path)
  A1 present          every registered surface carries its expected string (whitespace-
                      normalised, so a wrapped paragraph still matches)
  A2 retired          no retired brand phrase appears in any registered surface
  A3 coverage         every tracked file in a registered repo that carries the tagline's
                      stable tail ("for you and your agents") has a register row — so a
                      NEW surface cannot slip in unregistered
  A4 coverage live    the coverage predicate is not vacuous: when any tagline surface is
                      checked, it matched at least one file

A SKIP IS NOT A PASS. A registered repository that is not materialised in this checkout
(a partial working set, a light clone) is reported as `SKIP <repo>` and counted, never
silently treated as green: the reader can see that this run did not observe it. The
umbrella's CI job materialises the registered repos, so the shipped control is not
skipping them.

AUTHORED vs GENERATED — one property, one control. A file carrying the generator's
`DO-NOT-EDIT` marker is GENERATED, not an authored surface: it is skipped and COUNTED, not
silently passed. A generated page's tagline is exactly as current as the source its repo
pins, and the ONE control for "generated content matches its pinned source" is that repo's
own drift gate (the docs deploy regenerates and fails on any diff). Registering a generated
page here would be a SECOND implementation of that property, and it would go red for a
reason that belongs to a pin-currency cutover rather than to a tagline edit.

USAGE
  python3 scripts/check-brand.py [<root>]   check a tree (default: the repository root)
  python3 scripts/check-brand.py --self-test   prove every arm turns RED on its own
                                               mutation, and the clean fixture GREEN
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REGISTER_REL = "brand/surfaces.tsv"
RETIRED_REL = "brand/retired.txt"

# The tagline's stable tail. Every generation of the tagline ends in it, so it is the
# structural predicate for "this file names the product's tagline", not a word list:
# a new tagline with a different noun still matches, and still needs a register row.
TAIL = "for you and your agents"

# Paths that carry history or generated caches, never a live brand surface — plus the
# control's OWN two files, which name the tail by construction (the coverage arm would
# otherwise report the instrument as a surface).
EXCLUDES = [
    "CHANGELOG",
    "node_modules",
    ".build",
    ".git",
    "scripts/check-brand.py",
    "brand",
]


GENERATED_MARKER = "DO-NOT-EDIT"


def is_generated(path):
    """A file carrying the generator's marker is GENERATED, not an authored surface."""
    try:
        return GENERATED_MARKER in path.read_text(encoding="utf-8", errors="replace")[:4000]
    except OSError:
        return False


def norm(text):
    """Collapse whitespace runs so a WRAPPED paragraph still matches its expected text."""
    return re.sub(r"\s+", " ", text).strip()


def parse_register(root):
    path = root / REGISTER_REL
    if not path.is_file():
        return None, [f"A0 register: {REGISTER_REL} is missing"]
    rows, seen, findings = [], set(), []
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 3:
            findings.append(
                f"A0 register: {REGISTER_REL}:{lineno}: expected 3 tab-separated fields "
                f"(repo, path, expected), found {len(parts)}"
            )
            continue
        repo, rel, expected = (p.strip() for p in parts)
        if not repo or not rel or not expected:
            findings.append(f"A0 register: {REGISTER_REL}:{lineno}: an empty field")
            continue
        if (repo, rel) in seen:
            findings.append(f"A0 register: {REGISTER_REL}:{lineno}: duplicate row {repo}/{rel}")
            continue
        seen.add((repo, rel))
        rows.append((repo, rel, expected))
    if not rows and not findings:
        findings.append(f"A0 register: {REGISTER_REL} declares no surface")
    return rows, findings


def parse_retired(root):
    path = root / RETIRED_REL
    if not path.is_file():
        return None, [f"A0 register: {RETIRED_REL} is missing"]
    phrases = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        phrases.append(line)
    if not phrases:
        return None, [f"A0 register: {RETIRED_REL} declares no retired phrase"]
    return phrases, []


def materialised(root, repo):
    d = root / repo
    return d.is_dir() and any(d.iterdir()) if d.is_dir() else False


def git_grep_tail(root, repo):
    """The tracked files in `repo` carrying the tagline tail. Returns a set of paths."""
    cmd = ["git", "-C", str(root / repo), "grep", "-l", "-F", "-e", TAIL, "--", "."]
    for ex in EXCLUDES:
        cmd.append(f":(exclude){ex}")
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode not in (0, 1):
        raise RuntimeError(f"git grep failed in {repo}: {proc.stderr.strip()}")
    return {line.strip() for line in proc.stdout.splitlines() if line.strip()}


def arms(root):
    findings, skips, checked = [], [], 0
    rows, f = parse_register(root)
    findings += f
    retired, f = parse_retired(root)
    findings += f
    if rows is None or retired is None:
        return findings, skips, checked, 0

    repos = sorted({r for r, _, _ in rows})
    live_repos = set()
    for repo in repos:
        if materialised(root, repo):
            live_repos.add(repo)
        else:
            skips.append(f"SKIP  {repo} — not materialised in this checkout")

    # A1 PRESENT + A2 RETIRED, over the registered surfaces only.
    for repo, rel, expected in rows:
        if repo not in live_repos:
            continue
        path = root / repo / rel
        if not path.is_file():
            findings.append(f"A1 present: {repo}/{rel} is registered but does not exist")
            continue
        text = norm(path.read_text(encoding="utf-8", errors="replace"))
        checked += 1
        if norm(expected) not in text:
            findings.append(
                f"A1 present: {repo}/{rel} does not carry the canonical text "
                f"{expected!r}"
            )
        low = text.lower()
        for phrase in retired:
            if phrase.lower() in low:
                findings.append(
                    f"A2 retired: {repo}/{rel} still carries the retired brand phrase "
                    f"{phrase!r}"
                )

    # A3 COVERAGE: a file carrying the tagline tail must have a register row. A GENERATED
    # file (one carrying the generator's DO-NOT-EDIT marker) is skipped and COUNTED here:
    # its tagline's currency is proved by its producer's drift gate against the pinned
    # source, which is the ONE control for "generated content matches its input" — this
    # register is the ONE control for "authored surfaces carry the canonical text".
    registered = {(r, p) for r, p, _ in rows}
    hits = 0
    generated = 0
    tagline_checked = any(
        r in live_repos and rel.endswith("README.md") for r, rel, _ in rows
    )
    for repo in sorted(live_repos):
        for rel in sorted(git_grep_tail(root, repo)):
            hits += 1
            if is_generated(root / repo / rel):
                generated += 1
                continue
            if (repo, rel) not in registered:
                findings.append(
                    f"A3 coverage: {repo}/{rel} names the tagline but has no row in "
                    f"{REGISTER_REL} — register it (and give it the canonical text)"
                )
    # A4: the coverage predicate must observe something when a tagline surface is read.
    if tagline_checked and hits == 0:
        findings.append(
            f"A4 coverage live: no tracked file in the registered repos carries "
            f"{TAIL!r}, so the coverage predicate is vacuous"
        )
    return findings, skips, checked, generated


def report(root):
    findings, skips, checked, generated = arms(root)
    for s in skips:
        print(f"  {s}")
    if findings:
        for f in findings:
            print(f"  FAIL  {f}")
        print(f"\nFAIL: {len(findings)} finding(s) across {checked} surface(s)")
        return 1
    notes = []
    if generated:
        notes.append(f"{generated} generated page(s) skipped as DO-NOT-EDIT")
    if skips:
        notes.append(f"{len(skips)} repo(s) skipped as unmaterialised")
    print(
        f"  PASS  {checked} brand surface(s) carry the canonical text and no retired "
        f"phrase; coverage is live"
        + (f" ({'; '.join(notes)})" if notes else "")
    )
    return 0


# ── the self-test: every arm turns RED on its own mutation ───────────────────────────────────


def write_tree(base, register, retired, files):
    (base / "brand").mkdir(parents=True, exist_ok=True)
    (base / REGISTER_REL).write_text(register, encoding="utf-8")
    (base / RETIRED_REL).write_text(retired, encoding="utf-8")
    for rel, text in files.items():
        p = base / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    for repo in {rel.split("/")[0] for rel in files}:
        subprocess.run(["git", "init", "-q", str(base / repo)], check=True)
        subprocess.run(["git", "-C", str(base / repo), "add", "-A"], check=True)


def fixture(tmp, name):
    base = tmp / name
    register = (
        "# repo\tpath\texpected\n"
        "repoA\tREADME.md\t**The Agentic DevOps Factory for you and your agents.**\n"
        "repoB\tREADME.md\tthe agentic DevOps Factory for you and your agents\n"
    )
    retired = "# retired brand phrases\nwonky\nopen infrastructure compiler\n"
    files = {
        "repoA/README.md": "# A\n\n**The Agentic DevOps Factory for you and your agents.**\n",
        "repoB/README.md": "plugins for OpenCharly — the agentic DevOps Factory for you and "
        "your agents.\n",
    }
    write_tree(base, register, retired, files)
    return base


def self_test():
    failures = []

    def expect(name, base, want_red, want_in=None):
        findings, skips, _, _ = arms(base)
        red = bool(findings)
        if red != want_red:
            failures.append(f"{name}: expected RED={want_red}, got findings={findings}")
            return
        if want_in and not any(want_in in f for f in findings):
            failures.append(f"{name}: no finding named {want_in!r}; got {findings}")

    tmp = Path(tempfile.mkdtemp(prefix="check-brand-"))
    try:
        base = fixture(tmp, "clean")
        findings, skips, checked, _ = arms(base)
        if findings or skips or checked != 2:
            failures.append(f"clean: expected GREEN with 2 checked, got {findings} skips={skips} checked={checked}")

        base = fixture(tmp, "present")
        (base / "repoA/README.md").write_text(
            "**The agentic DevOps tool for you and your agents.**\n", encoding="utf-8"
        )
        expect("A1 present", base, True, "A1 present")

        base = fixture(tmp, "retired")
        (base / "repoB/README.md").write_text(
            "plugins for OpenCharly — the wonky DevOps tool for you and your agents.\n",
            encoding="utf-8",
        )
        expect("A2 retired", base, True, "A2 retired")

        base = fixture(tmp, "coverage")
        (base / "repoA/docs").mkdir(parents=True, exist_ok=True)
        (base / "repoA/docs/extra.md").write_text(
            "Our line: the agentic DevOps Factory for you and your agents.\n", encoding="utf-8"
        )
        subprocess.run(["git", "-C", str(base / "repoA"), "add", "-A"], check=True)
        expect("A3 coverage", base, True, "A3 coverage")

        base = fixture(tmp, "generated")
        (base / "repoA/docs").mkdir(parents=True, exist_ok=True)
        (base / "repoA/docs/gen.md").write_text(
            "description: the agentic DevOps Factory for you and your agents\n"
            "<!-- DO-NOT-EDIT — generated; its producer's drift gate owns its currency -->\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", str(base / "repoA"), "add", "-A"], check=True)
        findings, skips, _, generated = arms(base)
        if findings or generated != 1:
            failures.append(
                f"GENERATED: expected GREEN with 1 generated skip, got findings={findings} generated={generated}"
            )

        base = fixture(tmp, "wrapped")
        (base / "repoA/README.md").write_text(
            "**The Agentic DevOps Factory for you and\nyour agents.**\n", encoding="utf-8"
        )
        expect("A1 wrapped", base, False)

        base = fixture(tmp, "skip")
        shutil.rmtree(base / "repoB")
        findings, skips, checked, _ = arms(base)
        if findings or not skips or checked != 1:
            failures.append(f"SKIP: expected GREEN with a skip and 1 checked, got {findings} skips={skips} checked={checked}")

        base = fixture(tmp, "vacuous")
        (base / "repoA/README.md").write_text("nothing here\n", encoding="utf-8")
        (base / "repoB/README.md").write_text("nothing here either\n", encoding="utf-8")
        findings, _, _, _ = arms(base)
        if not any("A4 coverage live" in f for f in findings):
            failures.append(f"A4 vacuous: expected the vacuity finding, got {findings}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if failures:
        for f in failures:
            print(f"  FAIL  {f}")
        print(f"\nFAIL: {len(failures)} self-test arm(s) did not behave")
        return 1
    print("  PASS  every arm turns RED on its own mutation; the clean fixture stays GREEN")
    return 0


def main():
    root = Path(__file__).resolve().parent.parent
    args = sys.argv[1:]
    if "--self-test" in args:
        return self_test()
    positional = [a for a in args if not a.startswith("-")]
    if positional:
        root = Path(positional[0]).resolve()
    return report(root)


if __name__ == "__main__":
    sys.exit(main())
