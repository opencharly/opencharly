#!/usr/bin/env bash
# PreToolUse(Bash) discipline backstop for `git commit`.
#
# This hook enforces only immediate local mechanics:
#   - no `--no-verify` / `-n` bypass;
#   - no `core.hooksPath` override;
#   - commit commands must tokenize cleanly; and
#   - staged Go modules must be golangci-lint clean when the tool is available.
#
# Attribution identity/confidence, change class, CHANGELOG coverage,
# architecture, and all R0-R10 proof are judged once by the fresh pr-validator.
# They are deliberately absent here so two policy implementations cannot drift.

INPUT=$(cat)
case "$INPUT" in
  *git*commit*) ;;
  *) exit 0 ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 -B - "$INPUT" "$HERE" <<'PY'
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, sys.argv[2])
from gitcmd import dash_c_dir, git_invocations, hooks_path_override, mentions_subcommand


def block(message):
    sys.stderr.write("pre-commit-gate BLOCKED: " + message + "\n")
    sys.exit(2)


try:
    command = json.loads(sys.argv[1]).get("tool_input", {}).get("command", "")
except Exception:
    sys.exit(0)

try:
    invocations = git_invocations(command, "commit")
except ValueError:
    if mentions_subcommand(command, "commit"):
        block("cannot parse this commit command; balance its quotes or use `git commit -F <file>`.")
    sys.exit(0)


def has_no_verify(args):
    """Inspect flags only; consume message values so their text is never a flag."""
    i = 0
    while i < len(args):
        token = args[i]
        if token in ("-m", "-F", "--message", "--file"):
            i += 2
            continue
        if token.startswith(("--message=", "--file=")):
            i += 1
            continue
        if token == "--no-verify":
            return True
        if token.startswith("-") and not token.startswith("--"):
            for flag in token[1:]:
                if flag in ("m", "F"):
                    break
                if flag == "n":
                    return True
        i += 1
    return False


def git(args, cwd=None):
    base = ["git"] + (["-C", cwd] if cwd else [])
    try:
        result = subprocess.run(base + args, capture_output=True, text=True, timeout=10)
    except Exception:
        return None
    return result.stdout if result.returncode == 0 else None


def touched_go_modules(repo):
    names = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "--", "*.go"], repo)
    if not names:
        return set()
    base = os.path.abspath(repo or os.getcwd())
    roots = set()
    for name in names.splitlines():
        directory = os.path.dirname(os.path.join(base, name))
        while directory.startswith(base):
            if os.path.isfile(os.path.join(directory, "go.mod")):
                roots.add(directory)
                break
            parent = os.path.dirname(directory)
            if parent == directory:
                break
            directory = parent
    return roots


def workspace_member_roots(repo):
    """The absolute module roots go.work `use` directives list (empty when the
    repo has no go.work, or when it cannot be read)."""
    base = os.path.abspath(repo or os.getcwd())
    gw = os.path.join(base, "go.work")
    members = set()
    if not os.path.isfile(gw):
        return members
    try:
        with open(gw, encoding="utf-8") as f:
            for line in f:
                m = re.match(r"\s*use\s+(\S+)", line)
                if m:
                    members.add(os.path.abspath(os.path.join(base, m.group(1))))
    except OSError:
        return set()
    return members


# --- the Go toolchain the module names ------------------------------------------
#
# The lint leg must run the linter under the toolchain the module's own go.mod
# names — the same selection CI makes through `go-version-file` — and NOT under
# the host's ambient Go. A NEWER ambient compiler writes an export-data version
# the pinned linter's reader cannot read, and the linter then reports typecheck
# failures on a CLEAN tree: the gate would block a commit for code that is fine.
#
# (Measured on this host: golangci-lint v2.13.2 links x/tools v0.49.0, whose
# export-data reader understands version 4 and below; the host's go1.27.3 emits
# version 5, and the toolchain the module names, go1.26.8, emits version 4.)
GO_DIRECTIVE = re.compile(r"^\s*(go|toolchain)\s+(\S+?)(?:\s*//.*)?$")
GO_VERSION = re.compile(r"^(\d+)\.(\d+)(?:\.(\d+))?$")


def go_directives(path):
    """The `go` and `toolchain` directives of a go.mod or a go.work file."""
    found = {}
    try:
        with open(path, encoding="utf-8") as stream:
            for line in stream:
                match = GO_DIRECTIVE.match(line)
                if match and match.group(1) not in found:
                    found[match.group(1)] = match.group(2)
    except OSError:
        return {}
    return found


def go_version_key(version):
    """(major, minor, patch) for a Go version, or None when it is not one.

    A `toolchain` directive names its compiler "go1.26.8"; a `go` directive
    names the language version "1.26.8". Both parse here. A `go` directive
    with no patch ("go 1.24") is a LANGUAGE version: GOTOOLCHAIN rejects it
    ("go1.24 is a language version but not a toolchain version"), so it is
    taken at its lowest patch, which satisfies the language version and is a
    real release. A build suffix ("go1.27.3-X:nodwarf5") is cut, so the
    host's own toolchain parses like any other.
    """
    text = version[2:] if version.startswith("go") else version
    match = GO_VERSION.match(text.split("-", 1)[0])
    if not match:
        return None
    return (int(match.group(1)), int(match.group(2)), int(match.group(3) or 0))


def go_version_text(key):
    """The "1.26.8" form of a version key."""
    return "%d.%d.%d" % key


def exact_toolchain(directives):
    """The exact compiler a directive set names, or None."""
    named = directives.get("toolchain")
    if not named:
        return None
    key = go_version_key(named)
    return go_version_text(key) if key else None


def floor_version(directives):
    """The minimum language version a directive set names, or None."""
    named = directives.get("go")
    if not named:
        return None
    key = go_version_key(named)
    return go_version_text(key) if key else None


def wanted_toolchain(root, is_member, workspace_directives):
    """(version, exact) — the toolchain the module at `root` names.

    A standalone module is governed by its own go.mod. A go.work MEMBER is
    governed by the WORKSPACE: the go command ignores a module's own
    toolchain line in workspace mode, so the workspace's exact toolchain wins
    and otherwise the floor is the highest of the two files' `go` directives.

    `exact` says whether the version is a named compiler (a `toolchain`
    directive) or a floor (a `go` directive, which admits any patch of that
    release and therefore has no single name to pin to).
    """
    module = go_directives(os.path.join(root, "go.mod"))
    if not is_member:
        exact = exact_toolchain(module)
        if exact:
            return exact, True
        floor = floor_version(module)
        return (floor, False) if floor else (None, False)
    exact = exact_toolchain(workspace_directives)
    if exact:
        return exact, True
    floors = [f for f in (floor_version(module), floor_version(workspace_directives)) if f]
    if not floors:
        return None, False
    return max(floors, key=go_version_key), False


def local_toolchain(root, env):
    """The version of the toolchain this host has, or None when it is unknown.

    GOTOOLCHAIN=local makes the probe report the LOCAL toolchain and never
    switch, so the answer is about the host and not about the module.
    """
    if shutil.which("go") is None:
        return None
    probe = dict(env)
    probe["GOTOOLCHAIN"] = "local"
    try:
        result = subprocess.run(["go", "env", "GOVERSION"], cwd=root, env=probe,
                                capture_output=True, text=True, timeout=60)
    except (subprocess.TimeoutExpired, OSError):
        return None
    if result.returncode != 0:
        return None
    key = go_version_key((result.stdout or "").strip())
    return go_version_text(key) if key else None


def toolchain_usable(version, root, env):
    """Whether the named toolchain can be obtained on this host.

    `go version` under GOTOOLCHAIN=goX.Y.Z is the honest probe: the go command
    switches (and downloads) the toolchain before it runs any subcommand, so a
    successful probe means the lint leg really runs under the named compiler.
    A failed probe is an ENVIRONMENT problem, not a code problem — the lint leg
    is skipped with a NOTE instead of blocking a commit on it, the same
    fail-open the timeout and the exception path already take, and the
    pr-validator remains the gate.
    """
    if shutil.which("go") is None:
        return False
    probe = dict(env)
    probe["GOTOOLCHAIN"] = "go" + version
    try:
        result = subprocess.run(["go", "version"], cwd=root, env=probe,
                                capture_output=True, text=True, timeout=180)
    except (subprocess.TimeoutExpired, OSError):
        return False
    if result.returncode != 0:
        return False
    return ("go" + version) in (result.stdout or "")


def pinned_toolchain(root, is_member, workspace_directives, env):
    """The toolchain to pin the lint leg to, or None to keep the ambient one.

    The ambient toolchain is the HOST's. When it is not the one the module
    names, the linter reads a different export-data version than the one it
    was built for, and the lint leg reports typecheck failures on a clean tree
    — so the leg is pinned to the module's own toolchain, the one CI selects
    through `go-version-file`.

    One case keeps the ambient toolchain even when the versions differ: the
    module names a FLOOR (its `go` directive) and the host's toolchain
    satisfies that floor within the SAME release. A different patch of the
    same release writes the same export data, and GOTOOLCHAIN rejects a
    language version, so a floor has no exact name to pin to — pinning it
    would change the developer's compiler for no gain.
    """
    wanted, exact = wanted_toolchain(root, is_member, workspace_directives)
    if wanted is None:
        return None
    local = local_toolchain(root, env)
    if local is None:
        return wanted
    if exact or go_version_key(local)[:2] != go_version_key(wanted)[:2]:
        return wanted
    return None


def lint_staged_go(repo):
    if shutil.which("golangci-lint") is None:
        return
    # go.work member modules keep the workspace GOWORK; standalone modules
    # (out-of-process candy/, tools/* — their own go.mod, deliberately NOT in
    # go.work) must lint with GOWORK=off or golangci-lint fails typechecking
    # ("does not contain modules listed in go.work").
    workspace_members = workspace_member_roots(repo)
    workspace_directives = go_directives(os.path.join(os.path.abspath(repo), "go.work"))
    roots = sorted(touched_go_modules(repo))
    if not roots:
        return
    # The lint cache must live on a real filesystem, not the system temp dir:
    # /tmp is frequently a small tmpfs (or a sandbox caps its writes), and
    # golangci-lint's Go build needs far more than a tmpfs can hold. A
    # per-user cache dir on the root fs keeps the gate working on any host.
    cache_root = os.path.join(os.path.expanduser("~"), ".cache", "charly-gate-lint")
    try:
        os.makedirs(cache_root, exist_ok=True)
    except OSError:
        # A HOME that cannot be written must not block the commit (fail-open):
        # fall back to the system temp dir, exactly as the pre-fix hook did.
        cache_root = None
    for root in roots:
        env = dict(os.environ)
        is_member = os.path.abspath(root) in workspace_members
        if not is_member:
            env["GOWORK"] = "off"
        # The linter runs under the toolchain the module names, so its export
        # data is one it can read.
        pinned = pinned_toolchain(root, is_member, workspace_directives, env)
        if pinned:
            if not toolchain_usable(pinned, root, env):
                sys.stderr.write(
                    "pre-commit-gate NOTE: the Go toolchain go%s (named by %s) is not "
                    "available here; the lint leg is skipped for that module and the "
                    "pr-validator remains the gate.\n" % (pinned, os.path.join(root, "go.mod"))
                )
                continue
            env["GOTOOLCHAIN"] = "go" + pinned
        try:
            with tempfile.TemporaryDirectory(prefix="charly-gate-lint-", dir=cache_root) as cache:
                env["GOCACHE"] = os.path.join(cache, "go-build")
                env["GOLANGCI_LINT_CACHE"] = os.path.join(cache, "golangci-lint")
                env["GOTMPDIR"] = os.path.join(cache, "go-work")
                env["TMPDIR"] = os.path.join(cache, "tmp")
                # golangci-lint v2 locks at $TMPDIR/golangci-lint.lock and Go's
                # build cache needs $GOTMPDIR to exist; create the subdirs so the
                # lock open and the build work (a missing TMPDIR makes golangci-lint
                # report "parallel golangci-lint is running" — its ENOENT lock-open
                # error, not a real parallel run).
                for sub in ("go-build", "golangci-lint", "go-work", "tmp"):
                    os.makedirs(os.path.join(cache, sub), exist_ok=True)
                result = subprocess.run(
                    ["golangci-lint", "run"], cwd=root, env=env,
                    capture_output=True, text=True, timeout=180,
                )
        except subprocess.TimeoutExpired:
            sys.stderr.write(
                "pre-commit-gate NOTE: golangci-lint timed out in %s; "
                "the pr-validator remains the gate.\n" % root
            )
            continue
        except Exception:
            continue
        if result.returncode != 0:
            detail = ((result.stdout or "") + (result.stderr or "")).strip()
            block("golangci-lint reports issues in %s:\n%s" % (root, detail[:4000]))


# --- ZERO-ALIASES gate (v2) ---------------------------------------------------
# A deterministic backstop for the project rulebook's "Core is a PLUGIN HOST" ZERO-ALIASES
# standing rule: no NEW charly/*_aliases.go file, and no declaration-form
# re-export of a mechanism-kit symbol (an alias is a mislocated call site; the
# fix is MOVING the consumer into its owning plugin, never re-exporting). Alias
# files have NO migration exception; the IMPORT-PURITY residual-call-site
# exception (a body moving OUT of core in the SAME PR, net core-LOC negative)
# covers a plain kit import/call, NEVER an alias FORM. The fresh pr-validator is
# the architecture authority; this gate is the fail-open mechanical backstop that
# catches the unambiguous #86 (new alias file) / #87 (grown alias file) class the
# validator alone missed. A plain residual `kit.Foo()` CALL or `".../kit"` IMPORT
# is ALLOWED here — only alias FORMS block.
_KITS = r'(?:kit|deploykit|buildkit|loaderkit|vmshared|enginekit|statekit)'
# explicit declaration-form alias in ANY staged charly/*.go: `type X = kit.Y` / `var x = kit.Y`
ALIAS_DECL_EXPLICIT = re.compile(r'^\+.*\b(?:type|var)\s+\w+\s*=\s*' + _KITS + r'\.\w')
# grouped-block alias, scoped to charly/*_aliases.go only (avoids false positives on legit
# in-function `x = kit.var` reads in non-alias files): an indented `    Name = kit.Y` line.
ALIAS_DECL_GROUPED = re.compile(r'^\+\s+\w+\s*=\s*' + _KITS + r'\.\w+\s*(?:$|//)')
ALIASES_FILE = re.compile(r'(?:^|/)charly/.*_aliases\.go')


def merge_parent_shas(repo):
    """The 2nd+ parent commit-ish of an IN-PROGRESS merge, else [].

    A `git commit` that completes a merge (a conflict resolution, or an explicit
    `--no-commit` merge) records MERGE_HEAD naming the incoming parent(s). The
    staged diff (`git diff --cached`) compares ONLY against HEAD — the FIRST
    parent — so every file/line the merge pulls in from an incoming parent looks
    freshly 'added'. These SHAs let the gate tell a genuine addition (present in
    NEITHER parent) from a survivor merged in from an incoming parent (present in
    one). Empty on a normal commit, so the gate's non-merge behaviour is
    byte-for-byte unchanged."""
    out = git(["rev-parse", "MERGE_HEAD"], repo)
    if not out:
        return []
    return [s for s in (line.strip() for line in out.splitlines()) if s]


def blob_lines(repo, commitish, path):
    """The set of raw lines of `path` at `commitish` (empty if the path is absent)."""
    out = git(["show", "%s:%s" % (commitish, path)], repo)
    if out is None:
        return set()
    return set(out.splitlines())


def path_present(repo, shas, path):
    """True if `path` exists at ANY of the given commit-ish (a merge survivor)."""
    for sha in shas:
        if git(["cat-file", "-e", "%s:%s" % (sha, path)], repo) is not None:
            return True
    return False


def alias_gate(repo):
    base = os.path.abspath(repo or os.getcwd())
    if not os.path.isdir(os.path.join(base, "charly")):
        return  # not a charly superproject (e.g. an sdk/plugins submodule leg) — fail open
    # Merge-commit awareness: when the commit completes a merge, a file/line the
    # merge pulled in from an incoming parent is NOT branch-introduced and must
    # not be flagged (main's gofmt-realigned survivors trip the raw staged diff).
    # Only a GENUINE addition — present in the merge result but in NEITHER parent
    # (a new alias, or one invented during conflict resolution) — is caught.
    # merge_shas is empty on a normal commit, so that path is unchanged.
    merge_shas = merge_parent_shas(repo)
    parent_lines = {}  # path -> union of the path's lines across all incoming parents

    def merged_in_line(path, content):
        if not merge_shas or path is None:
            return False
        if path not in parent_lines:
            lines = set()
            for sha in merge_shas:
                lines |= blob_lines(repo, sha, path)
            parent_lines[path] = lines
        return content in parent_lines[path]

    # 1. A NEW charly/*_aliases.go file (status A) — absolute, no exception,
    #    UNLESS the merge carried it in from an incoming parent (already vetted
    #    on that parent's own landing).
    status = git(["diff", "--cached", "--name-status", "--no-renames", "--", "charly/*.go"], repo)
    new_alias_files = []
    if status:
        for line in status.splitlines():
            parts = line.split("\t")
            st = parts[0][:1] if parts else ""
            path = parts[-1] if len(parts) > 1 else (parts[0] if parts else "")
            if st == "A" and ALIASES_FILE.search(path):
                if merge_shas and path_present(repo, merge_shas, path):
                    continue  # merged in from an incoming parent, not branch-added
                new_alias_files.append(path)
    if new_alias_files:
        block("ZERO-ALIASES: a NEW charly/*_aliases.go file is staged (%s). Alias files have "
              "NO migration exception — an alias is a mislocated call site; move the consumer "
              "into its owning plugin instead of re-exporting. See the project rulebook 'The kernel/plugin "
              "boundary law' + the ZERO-ALIASES standing rule." % ", ".join(new_alias_files))
    # 2. Declaration-form kit-alias lines in the staged charly/*.go diff — again
    #    skipping any line the merge carried in from an incoming parent.
    #
    #    The prefixes are pinned because the diff header is how the path of each
    #    hunk is recovered, and the DEFAULT prefixes are a user setting:
    #    `diff.mnemonicPrefix` (on this host) makes `git diff --cached` emit
    #    `+++ i/<path>`, and `diff.noprefix` emits `+++ <path>` — either one
    #    leaves the path unrecovered, and the grouped-alias leg below then
    #    silently stops blocking. The explicit prefixes override both.
    diff = git(["diff", "--cached", "-U0", "--no-renames",
                "--src-prefix=a/", "--dst-prefix=b/", "--", "charly/*.go"], repo)
    if not diff:
        return
    cur_path = None
    for line in diff.splitlines():
        m = re.match(r'^\+\+\+ b/(.+)$', line)
        if m:
            cur_path = m.group(1)
            continue
        if not line.startswith("+") or line.startswith("+++"):
            continue
        content = line[1:]  # the raw added line, sans the diff '+' marker
        if ALIAS_DECL_EXPLICIT.search(line):
            if merged_in_line(cur_path, content):
                continue  # survivor from an incoming merge parent, not a new alias
            block("ZERO-ALIASES: a declaration-form kit-alias line is staged in charly/ (%s). "
                  "Move the consumer into its owning plugin; never re-export a mechanism-kit "
                  "symbol (an alias is a mislocated call site). See the project rulebook." % line.strip()[:120])
        if cur_path and ALIASES_FILE.search(cur_path) and ALIAS_DECL_GROUPED.search(line):
            if merged_in_line(cur_path, content):
                continue  # survivor from an incoming merge parent, not a new alias
            block("ZERO-ALIASES: a grouped kit-alias line is staged in %s (%s). Alias files have "
                  "no exception — move the consumer, do not grow the alias file. See the project rulebook."
                  % (cur_path, line.strip()[:120]))


for global_args, commit_args in invocations:
    if hooks_path_override(global_args):
        block("a `core.hooksPath` override bypasses project hooks.")
    if has_no_verify(commit_args):
        block("`git commit --no-verify` (or `-n`) bypasses project hooks.")
    repo = dash_c_dir(global_args)
    if repo is not None and not os.path.isdir(repo):
        continue
    lint_staged_go(repo)
    alias_gate(repo)

sys.exit(0)
PY
