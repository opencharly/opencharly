#!/usr/bin/env python3
"""Behavioral tests for the narrow commit gate and push safety gate."""

import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
COMMIT_GATE = os.path.join(HERE, "pre-commit-gate.sh")
PUSH_GATE = os.path.join(HERE, "pre-push-gate.sh")

failures = []
ran = 0


def gate(script, command, cwd=None, env=None):
    result = gate_result(script, command, cwd=cwd, env=env)
    return "BLOCK" if result.returncode == 2 else "ALLOW"


def gate_result(script, command, cwd=None, env=None):
    return subprocess.run(
        [script],
        input=json.dumps({"tool_input": {"command": command}}),
        capture_output=True,
        text=True,
        cwd=cwd,
        env=env,
    )


def expect(label, actual, expected):
    global ran
    ran += 1
    passed = actual == expected
    if not passed:
        failures.append(label)
    print("[%s] want=%-5s got=%-5s %s" % (
        "PASS" if passed else "FAIL", expected, actual, label,
    ))


def local_go_version():
    """The version of the Go toolchain this host has, e.g. '1.27.3'.

    The Go fixtures name it, so the gate's toolchain pin resolves to the LOCAL
    toolchain and the lint cases need no toolchain download. None when this
    host has no Go at all.
    """
    try:
        result = subprocess.run(["go", "env", "GOVERSION"], capture_output=True,
                                text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    text = (result.stdout or "").strip()
    if text.startswith("go"):
        text = text[2:]
    parts = text.split("-", 1)[0].split(".")
    if len(parts) < 2 or not all(part.isdigit() for part in parts):
        return None
    while len(parts) < 3:
        parts.append("0")
    return ".".join(parts[:3])


LOCAL_GO = local_go_version()


def repo(go_module=False, go_version=None):
    path = tempfile.mkdtemp(prefix="gate-test-")
    for args in (("init", "-q"), ("config", "user.email", "t@t"),
                 ("config", "user.name", "t")):
        subprocess.run(["git", "-C", path, *args], capture_output=True)
    if go_module:
        version = go_version or LOCAL_GO or "1.24"
        with open(os.path.join(path, "go.mod"), "w") as stream:
            stream.write("module gatetest\n\ngo %s\n" % version)
        with open(os.path.join(path, "main.go"), "w") as stream:
            stream.write("package main\n\nfunc main() {}\n")
    else:
        with open(os.path.join(path, "README.md"), "w") as stream:
            stream.write("# fixture\n")
    subprocess.run(["git", "-C", path, "add", "-A"], capture_output=True)
    subprocess.run(["git", "-C", path, "commit", "-qm", "initial"], capture_output=True)
    return path


clean = repo()
expect("commit hook: executable bit set",
       bool(os.stat(COMMIT_GATE).st_mode & stat.S_IXUSR), True)
expect("push hook: executable bit set",
       bool(os.stat(PUSH_GATE).st_mode & stat.S_IXUSR), True)
for label, command, expected in (
    ("commit: --no-verify blocked", "git commit --no-verify -m x", "BLOCK"),
    ("commit: -n blocked", "git commit -n -m x", "BLOCK"),
    ("commit: bundled -an blocked", "git commit -an -m x", "BLOCK"),
    ("commit: hooksPath override blocked", "git -c core.hooksPath=/x commit -m x", "BLOCK"),
    ("commit: bypass text inside message allowed", "git commit -m 'do not use --no-verify'", "ALLOW"),
    ("commit: attribution text is validator-owned", "git commit -m 'Assisted-by: arbitrary text'", "ALLOW"),
    ("commit: no attribution is not locally blocked", "git commit -m human", "ALLOW"),
    ("commit: clean heredoc allowed", "git commit -F - <<'EOF'\nbody\nEOF", "ALLOW"),
    ("commit: unparseable command blocked", 'git commit -m "unterminated', "BLOCK"),
    ("non-commit command allowed", "git add README.md", "ALLOW"),
):
    expect(label, gate(COMMIT_GATE, command, clean), expected)
shutil.rmtree(clean, ignore_errors=True)


if shutil.which("golangci-lint") is not None:
    bad = repo(go_module=True)
    with open(os.path.join(bad, "main.go"), "a") as stream:
        stream.write("\nfunc unused() {}\n")
    subprocess.run(["git", "-C", bad, "add", "main.go"], capture_output=True)
    expect("commit: lint failure blocked", gate(COMMIT_GATE, f"git -C {bad} commit -m x"), "BLOCK")
    shutil.rmtree(bad, ignore_errors=True)

    good = repo(go_module=True)
    with open(os.path.join(good, "main.go"), "w") as stream:
        stream.write("package main\n\nfunc main() { helper() }\nfunc helper() {}\n")
    subprocess.run(["git", "-C", good, "add", "main.go"], capture_output=True)
    expect("commit: lint-clean Go allowed", gate(COMMIT_GATE, f"git -C {good} commit -m x"), "ALLOW")
    shutil.rmtree(good, ignore_errors=True)

    # The lint cache must land on the root fs (~/.cache/charly-gate-lint/), not
    # the system temp dir: /tmp is frequently a small tmpfs (or a sandbox caps
    # its writes) and the lint build needs far more than a tmpfs can hold. With
    # HOME redirected to a temp dir, the hook must create the cache root there —
    # the pre-fix hook used a bare TemporaryDirectory under /tmp and never did.
    cache_home = tempfile.mkdtemp(prefix="gate-test-home-")
    cached = repo(go_module=True)
    with open(os.path.join(cached, "main.go"), "w") as stream:
        stream.write("package main\n\nfunc main() { helper() }\nfunc helper() {}\n")
    subprocess.run(["git", "-C", cached, "add", "main.go"], capture_output=True)
    env = dict(os.environ)
    env["HOME"] = cache_home
    env["GOMODCACHE"] = os.path.join(cache_home, "go", "pkg", "mod")
    env["GOPATH"] = os.path.join(cache_home, "go")
    result = subprocess.run(
        [COMMIT_GATE],
        input=json.dumps({"tool_input": {"command": f"git -C {cached} commit -m x"}}),
        capture_output=True, text=True, cwd=cached, env=env,
    )
    expect("commit: lint-clean Go with redirected HOME allowed",
           "BLOCK" if result.returncode == 2 else "ALLOW", "ALLOW")
    expect("commit: lint cache dir created under the redirected HOME",
           os.path.isdir(os.path.join(cache_home, ".cache", "charly-gate-lint")), True)
    shutil.rmtree(cached, ignore_errors=True)
    shutil.rmtree(cache_home, ignore_errors=True)


# --- the Go toolchain the module names (opencharly/opencharly#642) --------------
#
# The lint leg must run the linter under the TOOLCHAIN the module's own go.mod
# names — the one CI selects through `go-version-file` — and not under the
# host's ambient Go: a newer ambient compiler writes an export-data version the
# pinned linter cannot read, and the linter then reports typecheck failures on a
# CLEAN tree.
#
# The stub linter RECORDS the GOTOOLCHAIN it was invoked under, so the
# assertion is about the environment the lint leg ran in. Without the pin the
# recorded value is empty and both cases below fail. The stub `go` answers the
# two questions the gate asks: what the HOST has (`go env GOVERSION`) and
# whether the named toolchain can be obtained (`go version` under
# GOTOOLCHAIN=goX.Y.Z).
def stub_toolchain(go_toolchain, local="go1.27.3"):
    """A directory holding a stub `go` that reports `local` and, when
    `go_toolchain` is given, can also produce that toolchain."""
    path = tempfile.mkdtemp(prefix="gate-test-go-")
    go = os.path.join(path, "go")
    with open(go, "w") as stream:
        stream.write(
            "#!/bin/sh\n"
            "case \"$1\" in\n"
            "  env) echo \"%s\" ;;\n"
            "  version)\n"
            "    if [ -z \"%s\" ]; then exit 1; fi\n"
            "    echo \"go version %s linux/amd64\" ;;\n"
            "esac\n"
            "exit 0\n" % (local, go_toolchain or "", go_toolchain or "")
        )
    os.chmod(go, 0o755)
    return path


def stub_linter(recorder):
    """A directory holding a `golangci-lint` stub that records the GOTOOLCHAIN
    it was invoked under."""
    path = tempfile.mkdtemp(prefix="gate-test-lint-")
    linter = os.path.join(path, "golangci-lint")
    with open(linter, "w") as stream:
        stream.write("#!/bin/sh\necho \"${GOTOOLCHAIN}\" > \"%s\"\nexit 0\n" % recorder)
    os.chmod(linter, 0o755)
    return path


def recorded_toolchain(recorder):
    if not os.path.exists(recorder):
        return ""
    with open(recorder) as stream:
        return stream.read().strip()


# The module names 1.26.8; the host has 1.27.3. The linter must run under
# go1.26.8 — the toolchain the module names.
record = os.path.join(tempfile.mkdtemp(prefix="gate-test-rec-"), "toolchain")
env = dict(os.environ)
env["PATH"] = os.pathsep.join([
    stub_toolchain("go1.26.8"),
    stub_linter(record),
    env.get("PATH", ""),
])
pinned = repo(go_module=True, go_version="1.26.8")
with open(os.path.join(pinned, "main.go"), "a") as stream:
    stream.write("\n// touched\n")
subprocess.run(["git", "-C", pinned, "add", "main.go"], capture_output=True)
result = gate_result(COMMIT_GATE, f"git -C {pinned} commit -m x", env=env)
expect("commit: the lint leg runs under the toolchain the module names",
       recorded_toolchain(record), "go1.26.8")
expect("commit: a lint-clean module under the named toolchain is allowed",
       "BLOCK" if result.returncode == 2 else "ALLOW", "ALLOW")
shutil.rmtree(pinned, ignore_errors=True)

# The named toolchain cannot be obtained on this host: the lint leg is skipped
# with a visible NOTE and the commit is NOT blocked — an environment problem
# must not block a commit (the pr-validator remains the gate).
record = os.path.join(tempfile.mkdtemp(prefix="gate-test-rec-"), "toolchain")
env = dict(os.environ)
env["PATH"] = os.pathsep.join([
    stub_toolchain(""),
    stub_linter(record),
    env.get("PATH", ""),
])
unprovidable = repo(go_module=True, go_version="1.26.8")
with open(os.path.join(unprovidable, "main.go"), "a") as stream:
    stream.write("\n// touched\n")
subprocess.run(["git", "-C", unprovidable, "add", "main.go"], capture_output=True)
result = gate_result(COMMIT_GATE, f"git -C {unprovidable} commit -m x", env=env)
expect("commit: an unobtainable toolchain skips the lint leg without blocking",
       "BLOCK" if result.returncode == 2 else "ALLOW", "ALLOW")
expect("commit: an unobtainable toolchain says so in a NOTE",
       "go1.26.8" in (result.stderr or ""), True)
expect("commit: the lint leg does not run under the ambient toolchain",
       recorded_toolchain(record), "")
shutil.rmtree(unprovidable, ignore_errors=True)


# --- ZERO-ALIASES gate tests (charly superproject shape; no go.mod so the lint
# gate does not interfere — the alias gate is tested in isolation) ---
def charly_repo():
    path = tempfile.mkdtemp(prefix="gate-test-charly-")
    for args in (("init", "-q"), ("config", "user.email", "t@t"),
                 ("config", "user.name", "t")):
        subprocess.run(["git", "-C", path, *args], capture_output=True)
    os.mkdir(os.path.join(path, "charly"))
    with open(os.path.join(path, "charly", "foo.go"), "w") as stream:
        stream.write("package main\n\nfunc main() {}\n")
    with open(os.path.join(path, "charly", "existing_aliases.go"), "w") as stream:
        stream.write("package main\n\n// pre-existing alias file\n")
    subprocess.run(["git", "-C", path, "add", "-A"], capture_output=True)
    subprocess.run(["git", "-C", path, "commit", "-qm", "initial"], capture_output=True)
    return path


# NEW charly/*_aliases.go file (status A) — the #86 class. File has NO alias line,
# so the block is purely the new-alias-file check.
c = charly_repo()
with open(os.path.join(c, "charly", "deploykit_new_aliases.go"), "w") as stream:
    stream.write("package main\n\n// a new alias-named file, no alias line inside\n")
subprocess.run(["git", "-C", c, "add", "-A"], capture_output=True)
expect("commit: NEW charly/*_aliases.go file blocked (#86 class)",
       gate(COMMIT_GATE, f"git -C {c} commit -m x"), "BLOCK")
shutil.rmtree(c, ignore_errors=True)

# Explicit `var x = deploykit.Y` declaration-form alias in charly/foo.go.
c = charly_repo()
with open(os.path.join(c, "charly", "foo.go"), "w") as stream:
    stream.write("package main\n\nvar helper = deploykit.SomeFn\nfunc main() {}\n")
subprocess.run(["git", "-C", c, "add", "-A"], capture_output=True)
expect("commit: declaration-form var alias blocked",
       gate(COMMIT_GATE, f"git -C {c} commit -m x"), "BLOCK")
shutil.rmtree(c, ignore_errors=True)

# Explicit `type X = kit.Y` declaration-form alias.
c = charly_repo()
with open(os.path.join(c, "charly", "foo.go"), "w") as stream:
    stream.write("package main\n\ntype Box = kit.Thing\nfunc main() {}\n")
subprocess.run(["git", "-C", c, "add", "-A"], capture_output=True)
expect("commit: declaration-form type alias blocked",
       gate(COMMIT_GATE, f"git -C {c} commit -m x"), "BLOCK")
shutil.rmtree(c, ignore_errors=True)

# Grown (status M) charly/*_aliases.go with a NEW grouped alias line — the #87 class.
c = charly_repo()
with open(os.path.join(c, "charly", "existing_aliases.go"), "w") as stream:
    stream.write("package main\n\nvar (\n    NewAlias = vmshared.VmDomainIdentity\n)\n// pre-existing\n")
subprocess.run(["git", "-C", c, "add", "-A"], capture_output=True)
expect("commit: grouped alias in grown alias file blocked (#87 class)",
       gate(COMMIT_GATE, f"git -C {c} commit -m x"), "BLOCK")
shutil.rmtree(c, ignore_errors=True)

# The same case under a HOSTILE diff-prefix configuration: `diff.noprefix` and
# `diff.mnemonicPrefix` change the `+++` header of `git diff --cached`, and the
# gate recovers each hunk's path from that header. If the gate trusted the
# default prefixes, the grouped-alias leg would silently stop blocking on every
# developer whose git config sets either — a guardrail that disables itself
# under configuration. The env vars below reach every git the gate runs.
for label, key, value in (("diff.noprefix", "diff.noprefix", "true"),
                           ("diff.mnemonicPrefix", "diff.mnemonicPrefix", "true")):
    c = charly_repo()
    with open(os.path.join(c, "charly", "existing_aliases.go"), "w") as stream:
        stream.write("package main\n\nvar (\n    NewAlias = vmshared.VmDomainIdentity\n)\n// pre-existing\n")
    subprocess.run(["git", "-C", c, "add", "-A"], capture_output=True)
    env = dict(os.environ)
    env["GIT_CONFIG_COUNT"] = "1"
    env["GIT_CONFIG_KEY_0"] = key
    env["GIT_CONFIG_VALUE_0"] = value
    expect("commit: grouped alias in grown alias file blocked under %s" % label,
           gate(COMMIT_GATE, f"git -C {c} commit -m x", env=env), "BLOCK")
    shutil.rmtree(c, ignore_errors=True)

# A plain kit CALL is ALLOWED — IMPORT-PURITY's residual-call-site exception; the
# hook gates only alias FORMS, never a plain call (validator judges IMPORT-PURITY).
c = charly_repo()
with open(os.path.join(c, "charly", "foo.go"), "w") as stream:
    stream.write("package main\n\nfunc main() { _ = kit.Foo() }\n")
subprocess.run(["git", "-C", c, "add", "-A"], capture_output=True)
expect("commit: plain kit CALL allowed (not an alias form)",
       gate(COMMIT_GATE, f"git -C {c} commit -m x"), "ALLOW")
shutil.rmtree(c, ignore_errors=True)

# A plain kit IMPORT is ALLOWED — IMPORT-PURITY is validator-judged, not hook-gated.
c = charly_repo()
with open(os.path.join(c, "charly", "foo.go"), "w") as stream:
    stream.write("package main\n\nimport \"github.com/opencharly/sdk/deploykit\"\n\nfunc main() {}\n")
subprocess.run(["git", "-C", c, "add", "-A"], capture_output=True)
expect("commit: plain kit IMPORT allowed (IMPORT-PURITY is validator-judged)",
       gate(COMMIT_GATE, f"git -C {c} commit -m x"), "ALLOW")
shutil.rmtree(c, ignore_errors=True)

# An alias line OUTSIDE charly/ (e.g. an sdk/plugins submodule leg with no charly/
# dir) is not gated — fail-open for non-charly repos.
noc = repo()
with open(os.path.join(noc, "fake_aliases.go"), "w") as stream:
    stream.write("package main\n\nvar X = deploykit.Y\n")
subprocess.run(["git", "-C", noc, "add", "fake_aliases.go"], capture_output=True)
expect("commit: alias outside charly/ not gated (submodule leg fail-open)",
       gate(COMMIT_GATE, f"git -C {noc} commit -m x"), "ALLOW")
shutil.rmtree(noc, ignore_errors=True)

# A clean charly/*.go change with no alias form is allowed.
c = charly_repo()
with open(os.path.join(c, "charly", "foo.go"), "w") as stream:
    stream.write("package main\n\nfunc main() { println(\"hi\") }\n")
subprocess.run(["git", "-C", c, "add", "-A"], capture_output=True)
expect("commit: clean charly change allowed",
       gate(COMMIT_GATE, f"git -C {c} commit -m x"), "ALLOW")
shutil.rmtree(c, ignore_errors=True)


# --- ZERO-ALIASES merge-commit awareness --------------------------------------
# A behind-branch MERGE stages, relative to HEAD (the FIRST parent), everything
# the incoming branch brought in — including gofmt-REALIGNED (not new) alias
# survivors. Those must NOT trip the gate; only an alias present in NEITHER parent
# (a genuine new alias, incl. one invented while resolving a conflict) must block.
def git_q(path, *args):
    return subprocess.run(["git", "-C", path, *args], capture_output=True, text=True)


def charly_merge_base():
    """A charly superproject with a base commit on branch 'trunk' carrying a
    tab-indented grouped alias line, plus a 'feat' branch forked from it."""
    path = tempfile.mkdtemp(prefix="gate-test-merge-")
    git_q(path, "init", "-q", "-b", "trunk")
    git_q(path, "config", "user.email", "t@t")
    git_q(path, "config", "user.name", "t")
    os.mkdir(os.path.join(path, "charly"))
    with open(os.path.join(path, "charly", "foo.go"), "w") as stream:
        stream.write("package main\n\nfunc main() {}\n")
    with open(os.path.join(path, "charly", "existing_aliases.go"), "w") as stream:
        stream.write("package main\n\nvar (\n\tKeptAlias = vmshared.Foo\n)\n")
    git_q(path, "add", "-A")
    git_q(path, "commit", "-qm", "base")
    git_q(path, "branch", "feat")
    return path


# Case 1 (must ALLOW): trunk gofmt-REALIGNS the alias line (tab -> 4 spaces); feat
# makes an unrelated change; merging trunk stages the realigned line as '+', but it
# is present in the incoming parent -> a survivor, not a new alias.
m = charly_merge_base()
with open(os.path.join(m, "charly", "existing_aliases.go"), "w") as stream:
    stream.write("package main\n\nvar (\n    KeptAlias = vmshared.Foo\n)\n")
git_q(m, "commit", "-qam", "trunk realign")
git_q(m, "checkout", "-q", "feat")
with open(os.path.join(m, "charly", "foo.go"), "w") as stream:
    stream.write("package main\n\nfunc main() { println(\"feat\") }\n")
git_q(m, "commit", "-qam", "feat change")
git_q(m, "merge", "--no-commit", "--no-ff", "trunk")  # clean 3-way; pauses pre-commit
expect("commit: merge-in realigned alias survivor allowed",
       gate(COMMIT_GATE, f"git -C {m} commit -m x"), "ALLOW")
shutil.rmtree(m, ignore_errors=True)


# Case 2 (must BLOCK): during a merge, a GENUINELY new alias line (present in
# neither parent) is introduced -> still caught.
m = charly_merge_base()
with open(os.path.join(m, "charly", "foo.go"), "w") as stream:  # trunk: unrelated change
    stream.write("package main\n\nfunc main() { println(\"trunk\") }\n")
git_q(m, "commit", "-qam", "trunk change")
git_q(m, "checkout", "-q", "feat")
with open(os.path.join(m, "charly", "bar.go"), "w") as stream:  # feat: unrelated new file
    stream.write("package main\n")
git_q(m, "add", "-A")
git_q(m, "commit", "-qm", "feat change")
git_q(m, "merge", "--no-commit", "--no-ff", "trunk")  # clean 3-way; pauses pre-commit
with open(os.path.join(m, "charly", "existing_aliases.go"), "w") as stream:  # inject a new alias
    stream.write("package main\n\nvar (\n\tKeptAlias = vmshared.Foo\n\tBrandNew = kit.Sym\n)\n")
git_q(m, "add", "charly/existing_aliases.go")
expect("commit: genuinely-new alias during a merge still blocked",
       gate(COMMIT_GATE, f"git -C {m} commit -m x"), "BLOCK")
shutil.rmtree(m, ignore_errors=True)


# Case 3 (must ALLOW): a NEW charly/*_aliases.go FILE the merge carried in from the
# incoming parent (already vetted on its own landing) is not re-flagged.
m = charly_merge_base()
with open(os.path.join(m, "charly", "trunk_new_aliases.go"), "w") as stream:  # trunk adds it
    stream.write("package main\n\n// added on trunk\n")
git_q(m, "add", "-A")
git_q(m, "commit", "-qm", "trunk adds alias file")
git_q(m, "checkout", "-q", "feat")
with open(os.path.join(m, "charly", "bar.go"), "w") as stream:  # feat: unrelated new file
    stream.write("package main\n")
git_q(m, "add", "-A")
git_q(m, "commit", "-qm", "feat change")
git_q(m, "merge", "--no-commit", "--no-ff", "trunk")  # clean 3-way; pauses pre-commit
expect("commit: merge-in new alias FILE survivor allowed",
       gate(COMMIT_GATE, f"git -C {m} commit -m x"), "ALLOW")
shutil.rmtree(m, ignore_errors=True)


for label, command, expected in (
    ("push: --force blocked", "git push --force origin feat/x", "BLOCK"),
    ("push: -f blocked", "git push -f origin feat/x", "BLOCK"),
    ("push: force-with-lease blocked", "git push --force-with-lease origin feat/x", "BLOCK"),
    ("push: forced refspec blocked", "git push origin +feat/x", "BLOCK"),
    ("push: --no-verify blocked", "git push --no-verify origin feat/x", "BLOCK"),
    ("push: hooksPath override blocked", "git -c core.hooksPath=/x push origin feat/x", "BLOCK"),
    ("push: direct main blocked", "git push origin main", "BLOCK"),
    ("push: explicit main destination blocked", "git push origin HEAD:refs/heads/main", "BLOCK"),
    ("push: feature branch allowed", "git push origin feat/x", "ALLOW"),
    ("push: main as source allowed", "git push origin main:feat/x", "ALLOW"),
):
    expect(label, gate(PUSH_GATE, command), expected)

print("\n%d case(s), %d failure(s)" % (ran, len(failures)))
for failure in failures:
    print("  FAILED:", failure)
sys.exit(1 if failures else 0)
