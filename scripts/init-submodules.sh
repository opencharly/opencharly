#!/usr/bin/env bash
# init-submodules.sh — materialize the umbrella's submodules ON DEMAND: a derived
# WORKING SET by default, the named paths on request, or every declared path.
#
# WHY THIS EXISTS: the umbrella is a view over the org — 431 submodules at the root,
# each a real repo owned elsewhere. A full `--recurse-submodules` clone materializes
# 431 checkouts and 9.5 G on disk (8.3 G of it in .git/modules, ~87 % of it in the
# six vendored upstream mirrors; measured 2026-10-22). The pins live in the
# umbrella's INDEX, and every pin is audited from the index, so a checkout is
# only needed for the repos you actually build against or edit.
#
# BLOBLESS, NOT SHALLOW: `--filter=blob:none` keeps every commit and every tree, so
# the ancestry question the pin contract asks (`merge-base --is-ancestor <pin>
# origin/main`) stays DECIDABLE, while the blobs of history are never fetched. A
# `--depth 1` clone makes that question undecidable — it answers "not an ancestor"
# for a healthy pin, which is a silent misclassification. The filter must be an
# EXPLICIT FLAG on the init command: `filter = blob:none` in .gitmodules is NOT
# honoured by `git submodule update` (measured, git 2.56.0).
#
# THE WORKING SET IS DERIVED, never hand-listed (R2 — a second hand-maintained list
# drifts silently, and nothing would notice). It is derived from four committed
# sources:
#   1. charly.yml's `import:` local paths — what the project loads from.
#   2. charly.yml's pin contract — `pinned_from:` (the edge source) and the
#      `pin_map:` keys (the umbrella paths of the edge pins).
#   3. the harness corpus root — reasonix.toml's [skills] paths and the .dsh/skills
#      symlink farm, which both point INTO the marketplace.
#   4. the repos the umbrella's OWN GATES read — a QUOTED path under scripts/ whose
#      first segment is a declared submodule.
# A derived path that is NOT a declared submodule FAILS LOUD: a drift is caught,
# never skipped. (Source 4 cannot produce one: it only ever names a path it has
# already found to be declared.)
#
# WHY SOURCE 4 EXISTS — the light tree's gate must cover what the full tree's
# covers. Two of the umbrella's gate scripts compare a surface that lives in a
# submodule: action-review/charly.yml (the committed rulebook) and
# layer-charly-internals/.../git-workflow/SKILL.md (the authored coordination
# grammar). When those checkouts are absent, both gates SKIP the comparison and
# still exit 0 — a GREEN GATE THAT PROVES LESS, which is the defect class this
# branch exists to end. Measured on a light clone, 2026-10-22: the light tree's
# `charly task verify` reported 26/26 steps passed while six cross-repo
# comparisons never ran. Only a QUOTED path counts: a path in a COMMENT is a
# source citation (sdk/kit/runner.go is one), not a read.
#
# SAFETY (R6): a materialized path is never clobbered. A dirty checkout is left
# alone; a checkout that has commits the recorded gitlink does not contain is left
# alone and reported. Only a checkout that is a strict ANCESTOR of the recorded
# gitlink is advanced (the pin-wave case: the index moved, the checkout follows).
#
# A CHECKOUT THAT NEVER LANDED IS A STATE, NOT A SUCCESS. git clones a
# submodule with `--no-checkout` and writes the worktree in a LATER, SERIAL pass
# (git's `run_update_procedure` -> `git checkout -q -f <oid>`, one path at a
# time, after the parallel clone phase). A run that is interrupted half-way
# therefore leaves MANY paths cloned-but-empty: HEAD is at the pin, the index is
# empty, the worktree is empty — and `git submodule status` calls that path FINE
# (' ' = at the recorded commit). Measured on 2026-10-22: 385 of 431 paths
# reported OK under a HEAD-only criterion while not one file was on disk. The
# criterion here is therefore three-part, and the repair pass lands the pin
# where the checkout never arrived.
#
# MODES:
#   (default)     materialize the derived working set
#   --list        print the set that would be materialized; change nothing
#   --all         materialize EVERY declared submodule path (a pin wave needs the
#                 full set: `charly task sync` fails loud on an uninitialized path)
#   --paths a,b   materialize the named paths, given as ONE comma-separated string
#   <path>...     materialize the named paths, as separate arguments
#   --self-test   exercise the whole thing on a temp fixture
#   --land <path> land the pin in ONE path (internal: the repair pass calls it)
#   --check <path> report whether a path is really materialized (exit 1 if not)
#   --root <dir>  the umbrella root to act on (default: this script's parent)
#
#   INIT_JOBS=<n>         the parallel fetch width (default 8).
#   CHARLY_INIT_MODE      working-set | all | list — the mode, for a caller that
#                         selects it in the ENVIRONMENT (see the channel below).
#   CHARLY_INIT_PATHS     a comma-separated list of paths, for the same caller.
#
# THE ENVIRONMENT CHANNEL. `charly task init` selects its mode through the
# environment, never through a task param, and the reason is measured, not
# assumed:
#   - the plan runner substitutes a task param's VALUE into the command's TEXT
#     and the shell then PARSES that text, so a param carrying a shell
#     metacharacter EXECUTES (measured: a param of `$(touch /tmp/marker)`
#     created the marker);
#   - a param cannot reach a command step's process environment either: the
#     step's `env:` modifier is applied VERBATIM, so it cannot carry one;
#   - the plan runner also expands `${NAME}` in the command text against the
#     task's own merged env, and a name it cannot resolve SKIPS the step
#     (measured: a step whose text read `${CHARLY_INIT_MODE}` never ran).
# An ENVIRONMENT value is DATA: the shell never re-parses the result of a
# parameter expansion, so the value cannot become source. The step inherits the
# operator's environment, and this script reads it — as ONE implementation that
# owns path handling, next to the flags that say the same thing.
set -euo pipefail

MODE="working-set"
MODE_SET=""
ROOT=""
PATHS=()
CLI_PATHS=()
CLI_ALL=0
CLI_LIST=0
LAND=""
CHECK=""
JOBS="${INIT_JOBS:-8}"

usage() {
  # The whole leading comment block, whatever length it has grown to.
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="${2:?--root needs a directory}"; shift 2 ;;
    --list) CLI_LIST=1; shift ;;
    --all) CLI_ALL=1; shift ;;
    --paths)
      # A COMMA-separated list of paths — the shape a caller that carries its
      # paths as ONE string (an environment variable, a CI variable) has. The
      # split happens HERE, in the one implementation that owns path handling,
      # and every resulting path is validated against the declared set.
      IFS=',' read -r -a _paths <<< "${2:?--paths needs a comma-separated list}"
      for _p in "${_paths[@]}"; do
        [ -n "$_p" ] && CLI_PATHS+=("$_p")
      done
      shift 2
      ;;
    --self-test) MODE="self-test"; MODE_SET="flag"; shift ;;
    --land) MODE="land"; MODE_SET="flag"; LAND="${2:?--land needs a path}"; shift 2 ;;
    --check) MODE="check"; MODE_SET="flag"; CHECK="${2:?--check needs a path}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    --) shift; while [ $# -gt 0 ]; do CLI_PATHS+=("$1"); shift; done ;;
    -*) echo "FAIL: unknown option '$1' (try --help)" >&2; exit 2 ;;
    *) CLI_PATHS+=("$1"); shift ;;
  esac
done

# ── the environment channel ────────────────────────────────────────────────────
# Two AXES, decided in ONE place, so there is no second implementation of the
# same choice:
#   the SET    — which paths to act on: the derived working set, every declared
#                path, or a named list. Order of precedence: the paths given on
#                the command line, then --all, then CHARLY_INIT_PATHS, then
#                CHARLY_INIT_MODE=all, then the derived working set.
#   the ACTION — materialize, or list the set and change nothing: --list, or
#                CHARLY_INIT_MODE=list.
# The values are read as DATA and compared, never spliced into a command line,
# so a value carrying a shell metacharacter is a VALUE (and is named in the
# failure) rather than source.
ENV_ALL=0
ENV_LIST=0
ENV_PATHS=()
case "${CHARLY_INIT_MODE:-}" in
  "") ;;
  all) ENV_ALL=1 ;;
  list) ENV_LIST=1 ;;
  working-set) ;;
  *)
    echo "FAIL: CHARLY_INIT_MODE must be working-set, all or list (got '$CHARLY_INIT_MODE')" >&2
    exit 2
    ;;
esac
if [ -n "${CHARLY_INIT_PATHS:-}" ]; then
  IFS=',' read -r -a ENV_PATHS <<< "${CHARLY_INIT_PATHS}"
  _kept=()
  for _p in "${ENV_PATHS[@]}"; do
    [ -n "$_p" ] && _kept+=("$_p")
  done
  ENV_PATHS=("${_kept[@]}")
fi

if [ -z "$MODE_SET" ]; then
  if [ "${#CLI_PATHS[@]}" -gt 0 ]; then
    PATHS=("${CLI_PATHS[@]}")
  elif [ "$CLI_ALL" -eq 1 ]; then
    MODE="all"
  elif [ "${#ENV_PATHS[@]}" -gt 0 ]; then
    PATHS=("${ENV_PATHS[@]}")
  elif [ "$ENV_ALL" -eq 1 ]; then
    MODE="all"
  fi
  ACTION="materialize"
  if [ "$CLI_LIST" -eq 1 ] || [ "$ENV_LIST" -eq 1 ]; then ACTION="list"; fi
else
  ACTION="materialize"
fi

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
[ -n "$ROOT" ] || ROOT="$(cd "$(dirname "$SCRIPT")/.." && pwd)"

# REQUIREMENTS, checked and NAMED. `git` is the substrate; `python3` reads the
# committed sources (charly.yml, reasonix.toml) and scans the gate scripts for
# the paths they quote, which is a text scan with a comment-aware rule — a shell
# rewrite of it would be a second, weaker implementation of the same derivation
# (R2). A missing requirement must be a LOUD failure that names it: the
# alternative is a derivation that fails and is SWALLOWED, and this script's
# whole contract is that a failed derivation never becomes a green run.
for req in git python3; do
  if ! command -v "$req" >/dev/null 2>&1; then
    echo "init: FAIL — '$req' is not installed; this script needs git and python3" >&2
    exit 1
  fi
done

# ── the derivation ──────────────────────────────────────────────────────────────
# One implementation, shared by the live path and the self-test. It reads the
# committed sources; it never consults the network and never mutates anything.
derive_working_set() {
  python3 - "$ROOT" <<'PY'
import os, re, sys

root = sys.argv[1]
derived, seen = [], set()


def add(path):
    if not path:
        return
    path = path.strip().strip("/")
    while path.startswith("./"):
        path = path[2:]
    if not path or path in seen:
        return
    seen.add(path)
    derived.append(path)


manifest_path = os.path.join(root, "charly.yml")
if not os.path.isfile(manifest_path):
    sys.exit("FAIL: %s is absent — the working set cannot be derived" % manifest_path)
manifest = open(manifest_path, encoding="utf-8").read()
lines = manifest.split("\n")

# 1. the manifest's LOCAL import: paths (a @github import has no local path).
in_import = False
for line in lines:
    if re.match(r"^import:\s*$", line):
        in_import = True
        continue
    if in_import:
        if re.match(r"^\S", line) and line.strip() and not line.startswith("#"):
            break  # the next top-level key ends the block
        m = re.match(r"^\s*-\s*([A-Za-z0-9_.-]+):\s*(\S+)\s*$", line)
        if m and (m.group(2).startswith("./") or m.group(2).startswith("/")):
            add(m.group(2))

# 2. the pin contract: `pinned_from:` (the edge source) + the `pin_map:` keys
#    (the umbrella paths of the edge pins; the VALUES are charly's twins).
for line in lines:
    m = re.match(r"^\s*pinned_from:\s*(\S+)\s*$", line)
    if m:
        add(m.group(1))
in_map = False
map_indent = None
for line in lines:
    if re.match(r"^\s*pin_map:\s*$", line):
        in_map = True
        map_indent = None
        continue
    if in_map:
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        if map_indent is None:
            # the FIRST child line fixes the indent the map's entries live at;
            # anything deeper or shallower ends the block.
            map_indent = indent
        if indent != map_indent:
            in_map = False
            continue
        m = re.match(r"^\s+([A-Za-z0-9_.-]+):\s+(\S+)\s*$", line)
        if m:
            add(m.group(1))
            continue
        in_map = False

# 3. the harness corpus root: reasonix.toml's [skills] paths and the .dsh/skills
#    symlink farm both point INTO the marketplace (a per-family root).
toml_path = os.path.join(root, "reasonix.toml")
if os.path.isfile(toml_path):
    text = open(toml_path, encoding="utf-8").read()
    m = re.search(r"(?ms)^\[skills\]\s*(.*?)(?=^\[|\Z)", text)
    if m:
        pm = re.search(r"(?ms)^paths\s*=\s*\[(.*?)\]", m.group(1))
        if pm:
            for entry in re.findall(r'"([^"]+)"', pm.group(1)):
                add(entry.split("/")[0])
dsh = os.path.join(root, ".dsh", "skills")
if os.path.isdir(dsh):
    for name in sorted(os.listdir(dsh)):
        link = os.path.join(dsh, name)
        if not os.path.islink(link):
            continue
        target = os.path.normpath(os.path.join(os.path.dirname(link), os.readlink(link)))
        rel = os.path.relpath(target, root)
        if not rel.startswith(".."):
            add(rel.split("/")[0])

# 4. the repos the umbrella's OWN GATES read: a path in a string literal that is
#    CODE (not a comment) under scripts/, whose first segment is a declared
#    submodule. A gate that compares a surface in a submodule SKIPS the
#    comparison when that submodule is not checked out, and a skip is not a
#    failure — so a working set that omitted it would leave the light tree's gate
#    green over a smaller set of comparisons than the full tree's. A path in a
#    COMMENT is a citation, not a read, so comments are stripped before the scan.
declared = set()
gitmodules = os.path.join(root, ".gitmodules")
if os.path.isfile(gitmodules):
    for line in open(gitmodules, encoding="utf-8"):
        m = re.match(r"\s*path\s*=\s*(\S+)\s*$", line)
        if m:
            declared.add(m.group(1).strip("/"))


def code_strings(text, hash_comments=False):
    """Every string literal that is CODE — a literal inside a comment is a
    citation of a path, not a read of it. `hash_comments` is for shell, where a
    `#` opens a comment (in JS it does not)."""
    out, i, n = [], 0, len(text)
    in_block = False
    while i < n:
        c = text[i]
        if in_block:
            if text.startswith("*/", i):
                in_block = False
                i += 2
            else:
                i += 1
            continue
        if text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j == -1 else j
            continue
        if hash_comments and c == "#":
            j = text.find("\n", i)
            i = n if j == -1 else j
            continue
        if text.startswith("/*", i):
            in_block = True
            i += 2
            continue
        if c in "\"'`":
            quote, j = c, i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == quote:
                    break
                if text[j] == "\n" and quote != "`":
                    break
                j += 1
            out.append(text[i + 1:j])
            i = j + 1
            continue
        i += 1
    return out


scripts_dir = os.path.join(root, "scripts")
if declared and os.path.isdir(scripts_dir):
    for name in sorted(os.listdir(scripts_dir)):
        if not name.endswith((".mjs", ".js", ".sh")):
            continue
        path = os.path.join(scripts_dir, name)
        if not os.path.isfile(path):
            continue
        try:
            text = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for value in code_strings(text, hash_comments=name.endswith(".sh")):
            head = value.split("/")[0]
            if "/" in value and head in declared:
                add(head)

if not derived:
    sys.exit("FAIL: the working set derived EMPTY — a committed source it reads has drifted")
for path in sorted(derived):
    print(path)
PY
}

# ── the declared set ────────────────────────────────────────────────────────────
declared_submodules() {
  git -C "$ROOT" config -f "$ROOT/.gitmodules" --get-regexp '^submodule\..*\.path$' 2>/dev/null \
    | awk '{print $2}' | sort
}

# The recorded gitlink of a path: the SHA the umbrella's INDEX pins (the pin is
# the index entry — the checkout follows it, it does not define it).
recorded_gitlink() {
  git -C "$ROOT" ls-files -s -- "$1" | awk '$1 == "160000" {print $2; exit}'
}

# The state of a path per `git submodule status`: ' ' at its gitlink, '+' at a
# different commit, '-' not initialized, 'U' unmerged.
submodule_state() {
  git -C "$ROOT" submodule status -- "$1" 2>/dev/null | head -1 | cut -c1
}

# The number of files the submodule's INDEX records, and the number of entries
# its worktree carries. Both are zero for a clone whose checkout never landed.
submodule_index_count() {
  git -C "$ROOT/$1" ls-files 2>/dev/null | wc -l
}

submodule_worktree_count() {
  # `grep -v` exits 1 when it matches nothing (an empty worktree), and
  # `pipefail` would turn that into a fatal error — so the count is taken and
  # the status is discarded.
  ls -A "$ROOT/$1" 2>/dev/null | grep -v '^\.git$' | wc -l || true
}

# MATERIALIZED means all THREE hold: the checkout is at the recorded gitlink,
# its index is populated, and its worktree carries the files. The HEAD
# comparison alone is NOT enough — `git submodule status` reports a cloned-but-
# empty path as at-the-pin, which is how a half-materialized tree once passed
# as "OK" (measured: 385 of 431 paths, no files on disk).
is_materialized() {
  local path="$1" head recorded
  head="$(git -C "$ROOT/$path" rev-parse HEAD 2>/dev/null || true)"
  recorded="$(recorded_gitlink "$path")"
  [ -n "$recorded" ] && [ "$head" = "$recorded" ] || return 1
  [ "$(submodule_index_count "$path")" -gt 0 ] || return 1
  [ "$(submodule_worktree_count "$path")" -gt 0 ] || return 1
  return 0
}

# NEVER-CHECKED-OUT: an empty index AND an empty worktree. That is the state a
# killed run leaves behind, and it is NOT anybody's work: the clone's HEAD sits
# on the remote's default branch (git's own artifact), there are no files, and
# there is no index to lose. A checkout with content in it never takes this
# branch — that is the R6 case, and it is reported, never touched.
never_checked_out() {
  local path="$1"
  [ "$(submodule_index_count "$path")" -eq 0 ] || return 1
  [ "$(submodule_worktree_count "$path")" -eq 0 ] || return 1
  return 0
}

# REPAIRABLE: the checkout that never landed carries no work of anybody's. Its
# HEAD is a commit that exists upstream (the clone's default-branch tip), so
# moving it to the pin loses nothing: the newer commit stays in the object
# store and on the remote-tracking ref. A HEAD that is NOT upstream — a local
# commit — is somebody's work and is never moved (R6).
repairable() {
  local path="$1" head
  head="$(git -C "$ROOT/$path" rev-parse HEAD 2>/dev/null || true)"
  [ -n "$head" ] || return 0
  git -C "$ROOT/$path" merge-base --is-ancestor "$head" refs/remotes/origin/HEAD 2>/dev/null
}

# Land the pin in ONE path: make sure the commit is in the local object store
# (a blobless clone carries every commit, so it usually is), then check it out.
# git's checkout in a promisor (blobless) clone lazily fetches the tree's
# blobs from the remote, which is the slow half of a wave.
land_pin() {
  local path="$1" recorded out rc=0 gitdir
  # R6 — THE NO-CLOBBER GUARD LIVES HERE, and not only in the repair pass that
  # calls this function. `land_pin` is the ONE thing in this script that touches
  # a checkout, and it ends in `checkout -q -f --detach`, which DISCARDS tracked
  # changes. A direct `--land` on a checkout that carries work would therefore
  # throw that work away, so the guard the repair pass applies is expressed here,
  # once (R2), and it FAILS CLOSED on any invocation:
  #   - the checkout must carry NOTHING: an empty index AND an empty worktree
  #     (a dirty or populated checkout is somebody's work), and
  #   - its HEAD must be an upstream commit (a local commit is somebody's work).
  if ! never_checked_out "$path"; then
    echo "init: FAIL — $path: refusing to land the pin — the checkout carries content (an index, a worktree, or uncommitted work); left untouched" >&2
    return 1
  fi
  if ! repairable "$path"; then
    echo "init: FAIL — $path: refusing to land the pin — its HEAD is not an upstream commit (local work); left untouched" >&2
    return 1
  fi
  recorded="$(recorded_gitlink "$path")"
  if [ -z "$recorded" ]; then
    echo "init: FAIL — $path has no recorded gitlink in the index" >&2
    return 1
  fi
  if ! git -C "$ROOT/$path" cat-file -e "$recorded^{commit}" 2>/dev/null; then
    git -C "$ROOT/$path" fetch --quiet origin "$recorded" 2>/dev/null || true
  fi
  if ! git -C "$ROOT/$path" cat-file -e "$recorded^{commit}" 2>/dev/null; then
    echo "init: FAIL — $path: the recorded pin $recorded is not in the local object store" >&2
    return 1
  fi
  out="$(git -C "$ROOT/$path" checkout -q -f --detach "$recorded" 2>&1)" || rc=$?
  if [ "$rc" -ne 0 ]; then
    # A killed run leaves a stale index.lock behind and git refuses to write
    # over it. git NAMES the reason, so the repair is driven by git's own
    # message and not by a guess about how old the lock is.
    gitdir="$(git -C "$ROOT/$path" rev-parse --absolute-git-dir 2>/dev/null || true)"
    case "$out" in
      *index.lock*|*"File exists"*)
        [ -n "$gitdir" ] && rm -f "$gitdir/index.lock"
        rc=0
        out="$(git -C "$ROOT/$path" checkout -q -f --detach "$recorded" 2>&1)" || rc=$?
        ;;
    esac
  fi
  if [ "$rc" -ne 0 ]; then
    echo "init: FAIL — $path: the checkout of $recorded failed: $out" >&2
    return 1
  fi
  return 0
}

# ── the materialization ─────────────────────────────────────────────────────────
# One git call materializes every not-yet-initialized path, with the blobless
# filter and parallel fetches. `protocol.version=2` is explicit because the local
# transport defaults to v0, and only v2 advertises the `filter` capability — a
# v0 server silently IGNORES the filter and the clone comes out full.
materialize_uninitialized() {
  local -a todo=()
  local path
  for path in "$@"; do
    if [ "$(submodule_state "$path")" != "-" ]; then
      continue
    fi
    todo+=("$path")
  done
  [ "${#todo[@]}" -gt 0 ] || return 0
  git -C "$ROOT" -c protocol.version=2 submodule update --init --recursive \
    --filter=blob:none --jobs "$JOBS" -- "${todo[@]}"
}

# Advance ONE already-materialized path to the recorded gitlink, or leave it
# alone and report why. Never clobbers (R6).
advance_path() {
  local path="$1" head recorded
  head="$(git -C "$ROOT/$path" rev-parse HEAD 2>/dev/null || true)"
  recorded="$(recorded_gitlink "$path")"
  if [ -z "$recorded" ]; then
    echo "init: FAIL — $path has no recorded gitlink in the index" >&2
    return 1
  fi
  if [ "$head" = "$recorded" ]; then
    return 0
  fi
  if [ -n "$(git -C "$ROOT/$path" status --porcelain 2>/dev/null || true)" ]; then
    echo "init: notice — $path has UNCOMMITTED changes; left untouched" >&2
    return 1
  fi
  # The recorded gitlink may not be in the local object store yet (the pin moved
  # ahead of the checkout). Fetch it before judging the ancestry — a blobless
  # clone still carries every commit, so the judgement stays decidable.
  if ! git -C "$ROOT/$path" cat-file -e "$recorded^{commit}" 2>/dev/null; then
    git -C "$ROOT/$path" fetch --quiet origin || true
  fi
  if git -C "$ROOT/$path" merge-base --is-ancestor "$head" "$recorded" 2>/dev/null; then
    # `--init` is REQUIRED alongside `--filter` (git rejects the combination
    # without it), and it is a no-op for a path that is already initialized.
    git -C "$ROOT" -c protocol.version=2 submodule update --init --recursive --filter=blob:none -- "$path"
    return 0
  fi
  echo "init: FAIL — $path is at $head, which is NOT an ancestor of its recorded gitlink $recorded; left untouched (its own commits are not the umbrella's to discard)" >&2
  return 1
}

# The REPAIR pass: land the pin in every requested path whose checkout never
# arrived. This is what makes the operation RESUMABLE — a run that was killed
# half-way leaves the rest to the next run — and it is the only thing here
# that touches a checkout. The checkouts run in parallel (INIT_JOBS wide):
# git checks them out one at a time, and each one lazily fetches its tree's
# blobs, so the serial pass is the slow half of a full wave.
repair_paths() {
  local -a todo=()
  local path
  local rc=0
  for path in "$@"; do
    is_materialized "$path" && continue
    if ! never_checked_out "$path"; then
      continue
    fi
    if ! repairable "$path"; then
      echo "init: FAIL — $path: the checkout never landed AND its HEAD is not an upstream commit (local work); left untouched" >&2
      rc=1
      continue
    fi
    todo+=("$path")
  done
  # The rest are repaired even when one of them could not be touched: a run
  # that stops at the first refusal would leave the tree half-repaired.
  if [ "${#todo[@]}" -gt 0 ]; then
    printf '%s\0' "${todo[@]}" \
      | xargs -0 -P "$JOBS" -I{} env CHARLY_INIT_LAND=1 bash "$SCRIPT" --root "$ROOT" --land {} || rc=$?
    if [ "$rc" -ne 0 ]; then
      echo "init: FAIL — the checkout of ${#todo[@]} path(s) did not land" >&2
    fi
  fi
  return "$rc"
}

# ── the live path ───────────────────────────────────────────────────────────────
run_live() {
  # A --land child MUST NOT run the live path: the repair pass invokes this
  # script recursively, and a mode mix-up would fork-bomb. The guard is the
  # child's own contract — not a timeout, and not a retry.
  if [ "${CHARLY_INIT_LAND:-0}" = "1" ]; then
    echo "init: FAIL — internal: a --land child must not run the live path" >&2
    return 1
  fi
  local -a want=()
  # A DERIVATION THAT FAILS MUST FAIL LOUD. `mapfile -t want < <(derive)` does
  # NOT propagate the process substitution's exit status (mapfile reports its
  # own), so a derivation that exits non-zero used to be swallowed: `want` came
  # out EMPTY, the run validated nothing, materialized nothing, and the verdict
  # `0 -eq 0` printed "init: OK — 0 of 0 requested path(s)". A green run over a
  # derivation failure. The status is therefore captured EXPLICITLY, and both a
  # failure and an EMPTY result stop the run.
  case "$MODE" in
    all)
      local declared_set
      if ! declared_set="$(declared_submodules)"; then
        echo "init: FAIL — the declared submodule set could not be read from $ROOT/.gitmodules" >&2
        return 1
      fi
      if [ -z "$declared_set" ]; then
        echo "init: FAIL — .gitmodules declares NO submodule path (an empty index is a drift, not an empty tree)" >&2
        return 1
      fi
      mapfile -t want <<<"$declared_set"
      ;;
    working-set)
      # NAMED paths win over the derived set: a caller that asked for paths
      # gets exactly those, and the list action reports what WOULD be
      # materialized.
      if [ "${#PATHS[@]}" -gt 0 ]; then
        want=("${PATHS[@]}")
      else
        local derived_set
        if ! derived_set="$(derive_working_set)"; then
          echo "init: FAIL — the working set could not be derived (the derivation's own reason is above)" >&2
          return 1
        fi
        if [ -z "$derived_set" ]; then
          echo "init: FAIL — the working set derived EMPTY (a committed source it reads has drifted)" >&2
          return 1
        fi
        mapfile -t want <<<"$derived_set"
      fi
      ;;
  esac

  if [ "$ACTION" = "list" ]; then
    printf '%s\n' "${want[@]}"
    if [ "${#PATHS[@]}" -gt 0 ]; then
      echo "init: the requested set is ${#want[@]} path(s); nothing was materialized"
    else
      echo "init: the derived working set is ${#want[@]} path(s); nothing was materialized"
    fi
    return 0
  fi

  # Every path we were asked for must be a DECLARED submodule: a typo and a drift
  # look the same here, and both are failures, not silent skips.
  local declared path bad=0
  declared="$(declared_submodules)"
  for path in "${want[@]}"; do
    if ! grep -qxF "$path" <<<"$declared"; then
      echo "init: FAIL — '$path' is not a declared submodule of this umbrella" >&2
      bad=1
    fi
  done
  [ "$bad" -eq 0 ] || return 1

  materialize_uninitialized "${want[@]}"

  # The REPAIR pass. git checks the paths out one at a time, AFTER the parallel
  # clone phase, so an interrupted run leaves the tail of them cloned-but-empty
  # — a state `git submodule status` reports as at-the-pin. Land those pins
  # here, in parallel, and the run becomes resumable.
  local bad_state=0
  repair_paths "${want[@]}" || bad_state=1

  for path in "${want[@]}"; do
    state="$(submodule_state "$path")"
    case "$state" in
      "-") echo "init: FAIL — $path did not materialize" >&2; bad_state=1; continue ;;
      "U") echo "init: FAIL — $path is unmerged" >&2; bad_state=1; continue ;;
    esac
    advance_path "$path" || bad_state=1
  done
  [ "$bad_state" -eq 0 ] || return 1

  # The VERDICT counts what is really on disk, not what HEAD claims. This is
  # the control that was missing: a HEAD-only criterion called a
  # half-materialized tree OK (measured: 385 of 431 paths, no files at all).
  local total initialized
  total="$(declared_submodules | wc -l)"
  initialized=0
  for path in "${want[@]}"; do
    if is_materialized "$path"; then
      initialized=$((initialized + 1))
    else
      echo "init: FAIL — $path is NOT materialized: HEAD $(git -C "$ROOT/$path" rev-parse HEAD 2>/dev/null || echo '<none>'), index $(submodule_index_count "$path") file(s), worktree $(submodule_worktree_count "$path") entry(ies)" >&2
    fi
  done
  [ "$initialized" -eq "${#want[@]}" ] || return 1
  echo "init: OK — ${initialized} of ${#want[@]} requested path(s) are materialized at their recorded gitlinks"
  echo "init: notice — $((total - ${#want[@]})) of $total declared submodule path(s) have no checkout; their pin is still audited from the index (uninitialized, not a failure)"
}

# ── the self-test ───────────────────────────────────────────────────────────────
# Every claim the script makes is exercised on a temp fixture, and each mutation
# of the script must turn a claim red (R7 — a test that cannot fail is invalid).
run_self_test() {
  # The fixture's git environment: isolated from the host, deterministic, no
  # network. `protocol.file.allow` is what lets git fetch the fixture's own
  # `file://` remotes — the same isolation the other fixture gates use.
  export GIT_CONFIG_GLOBAL=/dev/null
  export GIT_CONFIG_SYSTEM=/dev/null
  export GIT_CONFIG_COUNT=2
  export GIT_CONFIG_KEY_0=protocol.file.allow
  export GIT_CONFIG_VALUE_0=always
  export GIT_CONFIG_KEY_1=init.defaultBranch
  export GIT_CONFIG_VALUE_1=main
  export GIT_AUTHOR_NAME=fixture
  export GIT_AUTHOR_EMAIL=fixture@example.invalid
  export GIT_COMMITTER_NAME=fixture
  export GIT_COMMITTER_EMAIL=fixture@example.invalid
  # The self-test is HERMETIC about the environment channel: the operator's own
  # CHARLY_INIT_MODE / CHARLY_INIT_PATHS must not reach it, or the claims would
  # assert whatever the shell that ran the test happened to carry.
  unset CHARLY_INIT_MODE CHARLY_INIT_PATHS
  BASE="$(mktemp -d)"
  trap 'rm -rf "$BASE"' EXIT
  local fails=0
  local fixture="$BASE/umbrella"
  mkdir -p "$fixture"

  # One remote, FIVE declared submodules, and one more that is NOT derived.
  # The remote carries THREE commits: the fixture pins the MIDDLE one, so the
  # history has a blob behind the pin (the blobless claim) and a commit ahead of
  # it (the fast-forward claim).
  local remote="$BASE/remote.git" seed="$BASE/seed"
  git -c init.defaultBranch=main init -q "$seed"
  (
    cd "$seed"
    echo v1 > file.txt
    git add file.txt
    git -c user.email=fixture@example.invalid -c user.name=fixture commit -qm c1
    echo v2 > file.txt
    git commit -qam c2
    echo v3 > file.txt
    git commit -qam c3
  ) >/dev/null 2>&1
  git clone -q --bare "$seed" "$remote"
  # The fixture's server advertises the filter, the way GitHub does.
  git -C "$remote" config uploadpack.allowFilter true
  local head_sha pinned_sha old_blob
  head_sha="$(git -C "$seed" rev-parse HEAD)"
  pinned_sha="$(git -C "$seed" rev-parse HEAD~1)"
  old_blob="$(git -C "$seed" rev-parse HEAD~2:file.txt)"

  git -C "$fixture" init -q
  {
    for p in core extra corpus other skipped gated; do
      printf '[submodule "%s"]\n\tpath = %s\n\turl = file://%s\n\tbranch = main\n' "$p" "$p" "$remote"
    done
  } >"$fixture/.gitmodules"
  for p in core extra corpus other skipped gated; do
    git -C "$fixture" update-index --add --cacheinfo "160000,$pinned_sha,$p"
  done
  git -C "$fixture" add .gitmodules
  git -C "$fixture" -c user.email=fixture@example.invalid -c user.name=fixture commit -qm fixture

  # The three committed sources the working set is derived from.
  cat >"$fixture/charly.yml" <<'YAML'
repo: github.com/opencharly/fixture
import:
    - core: ./core
    - extra: ./extra
defaults:
    tag: auto
pins:
  task:
    description: fixture
    dir: .
    plan:
      - run: fixture
        git-submodules:
          mode: verify
          pinned_from: core
          pin_map:
            other: box/other
YAML
  cat >"$fixture/reasonix.toml" <<'TOML'
[skills]
paths = [
    "corpus/agent/skills",
]
TOML
  mkdir -p "$fixture/.dsh/skills"
  ln -sf ../../corpus/agent/skills/one "$fixture/.dsh/skills/one"

  # Source 4: the umbrella's own gate scripts. The fixture's gate QUOTES a path
  # under a declared submodule (so it is a read, and the repo joins the working
  # set), mentions a declared submodule only in a COMMENT (so it is a citation,
  # not a read, and the repo stays out), and quotes a path under a name that is
  # NOT a declared submodule (so it is nothing at all).
  mkdir -p "$fixture/scripts"
  cat >"$fixture/scripts/check-fixture.mjs" <<'JS'
// A fixture gate. It READS the committed rulebook…
const rulebook = join(dir, "gated/charly.yml");
// …CITES a source file it does not read (skipped/kit/thing.go).
// It also quotes a path under a name that is not a submodule: "notarepo/x.md".
JS

  # ── claim 1: the derived set is EXACTLY the four sources' paths ─────────────
  local derived
  derived="$(bash "$SCRIPT" --root "$fixture" --list | sed -n '1,/^init:/p' | grep -v '^init:' || true)"
  local expected="core
corpus
extra
gated
other"
  if [ "$derived" = "$expected" ]; then
    echo "  PASS  the working set is derived from the four committed sources"
  else
    echo "  FAIL  the derived working set is wrong" >&2
    echo "        want: $(printf '%s' "$expected" | tr '\n' ' ')" >&2
    echo "        got:  $(printf '%s' "$derived" | tr '\n' ' ')" >&2
    fails=$((fails + 1))
  fi

  # ── claim 1b: source 4 DISCRIMINATES — a gate's QUOTED path joins the set, a
  # ──          commented path and a non-submodule path do not ─────────────────
  # The claim has to be able to FAIL: the same fixture, with the one quoted
  # string turned into a comment, must LOSE the repo from the derived set. A
  # claim that only asserts the positive could not tell a working derivation
  # from a scan that adds everything.
  local quoted_root="$BASE/umbrella-commented"
  cp -a "$fixture" "$quoted_root"
  sed -i 's|^const rulebook = join(dir, "gated/charly.yml");|// const rulebook = join(dir, "gated/charly.yml");|' \
    "$quoted_root/scripts/check-fixture.mjs"
  local commented derived_commented
  commented="$(bash "$SCRIPT" --root "$quoted_root" --list | sed -n '1,/^init:/p' | grep -v '^init:' || true)"
  derived_commented="$(printf '%s\n' "$commented" | grep -c '^gated$' || true)"
  local quoted_present
  quoted_present="$(printf '%s\n' "$derived" | grep -c '^gated$' || true)"
  if [ "$quoted_present" -eq 1 ] && [ "$derived_commented" -eq 0 ]; then
    echo "  PASS  source 4 discriminates — a gate's QUOTED path joins the set, a commented one does not"
  else
    echo "  FAIL  source 4 does not discriminate (quoted=$quoted_present commented=$derived_commented)" >&2
    fails=$((fails + 1))
  fi

  # ── claim 2: --paths materializes EXACTLY the named paths, and the comma ─────
  # ──          split is what makes "core,extra" two paths, not one ────────────
  # The named set is the shape a caller that carries its paths as ONE string has
  # (an environment variable, a CI variable), so the split lives HERE — in the one
  # implementation that owns path handling — and every resulting path is
  # validated against the declared set.
  local named_out named_rc
  named_out="$(bash "$SCRIPT" --root "$fixture" --paths core,extra 2>&1)" && named_rc=0 || named_rc=$?
  local named_bad=0
  if [ "$named_rc" -ne 0 ]; then
    echo "  FAIL  --paths core,extra did not materialize (rc=$named_rc)" >&2
    printf '%s\n' "$named_out" | sed 's/^/        /' >&2
    named_bad=1
  fi
  local p
  for p in core extra; do
    if [ ! -e "$fixture/$p/.git" ]; then
      echo "  FAIL  --paths core,extra did not materialize $p" >&2
      named_bad=1
    fi
  done
  for p in corpus other skipped; do
    if [ -e "$fixture/$p/.git" ]; then
      echo "  FAIL  --paths core,extra materialized $p, which was NOT named" >&2
      named_bad=1
    fi
  done
  if [ "$named_bad" -eq 0 ]; then
    echo "  PASS  --paths materializes exactly the named paths (and the comma split is the split)"
  else
    fails=$((fails + 1))
  fi

  # A named path OUTSIDE the working set is still selectable — that is the point
  # of naming paths. `--list` reports it without touching the tree.
  local named_list
  named_list="$(bash "$SCRIPT" --root "$fixture" --paths skipped --list 2>/dev/null | sed -n '1,/^init:/p' | grep -v '^init:' || true)"
  if [ "$named_list" = "skipped" ]; then
    echo "  PASS  a named path outside the working set is selectable"
  else
    echo "  FAIL  a named path outside the working set was not selectable (got: $named_list)" >&2
    fails=$((fails + 1))
  fi

  # An undeclared named path fails loud and is named — the same contract as a
  # positional path (claim 7).
  local out
  out="$(bash "$SCRIPT" --root "$fixture" --paths not-a-submodule 2>&1)" && out_rc=0 || out_rc=$?
  if [ "$out_rc" -ne 0 ] && grep -q 'not-a-submodule' <<<"$out"; then
    echo "  PASS  an undeclared named path fails loud and is named"
  else
    echo "  FAIL  an undeclared named path did not fail loud (rc=$out_rc): $out" >&2
    fails=$((fails + 1))
  fi

  # ── claim 3: the working set materializes, and NOTHING ELSE does ─────────────
  local live_out live_rc
  live_out="$(bash "$SCRIPT" --root "$fixture" 2>&1)" && live_rc=0 || live_rc=$?
  if [ "$live_rc" -eq 0 ]; then
    local p bad=0
    for p in core extra corpus other gated; do
      if [ ! -e "$fixture/$p/.git" ]; then
        echo "  FAIL  $p was not materialized" >&2
        bad=1
      fi
    done
    for p in skipped; do
      if [ -e "$fixture/$p/.git" ]; then
        echo "  FAIL  $p was materialized but is NOT in the working set" >&2
        bad=1
      fi
    done
    if [ "$bad" -eq 0 ]; then
      echo "  PASS  the working set materialized, and the undeclared set stayed out"
    else
      fails=$((fails + 1))
    fi
  else
    echo "  FAIL  the working set did not materialize (rc=$live_rc)" >&2
    printf '%s\n' "$live_out" | sed 's/^/        /' >&2
    fails=$((fails + 1))
  fi

  # ── claim 4: every materialized path is AT its recorded gitlink ──────────────
  local p drifted=0
  for p in core extra corpus other gated; do
    local want_sha got_sha
    want_sha="$(git -C "$fixture" ls-files -s -- "$p" | awk '{print $2}')"
    got_sha="$(git -C "$fixture/$p" rev-parse HEAD 2>/dev/null || true)"
    if [ "$want_sha" != "$got_sha" ]; then
      echo "  FAIL  $p is at $got_sha, not its recorded gitlink $want_sha" >&2
      drifted=1
    fi
  done
  if [ "$drifted" -eq 0 ]; then
    echo "  PASS  every materialized path sits at its recorded gitlink"
  else
    fails=$((fails + 1))
  fi

  # ── claim 5: the object store is BLOBLESS (history's blobs are not fetched) ──
  local promisor filter present
  promisor="$(git -C "$fixture/core" config --get remote.origin.promisor || true)"
  filter="$(git -C "$fixture/core" config --get remote.origin.partialclonefilter || true)"
  present="$(git -C "$fixture/core" cat-file --batch-all-objects --batch-check='%(objectname)' 2>/dev/null | grep -c "^$old_blob$" || true)"
  if [ "$promisor" = "true" ] && [ "$filter" = "blob:none" ] && [ "$present" = "0" ]; then
    echo "  PASS  the materialization is blobless (promisor, filter, history's blob absent)"
  else
    echo "  FAIL  the materialization is not blobless (promisor=$promisor filter=$filter historical-blob-present=$present)" >&2
    fails=$((fails + 1))
  fi

  # ── claim 6: --all materializes EVERY declared path ─────────────────────────
  if bash "$SCRIPT" --root "$fixture" --all >/dev/null 2>&1 && [ -e "$fixture/skipped/.git" ]; then
    echo "  PASS  --all materialized every declared path"
  else
    echo "  FAIL  --all did not materialize every declared path" >&2
    fails=$((fails + 1))
  fi

  # ── claim 7: a path that is NOT a declared submodule fails LOUD ─────────────
  local out
  out="$(bash "$SCRIPT" --root "$fixture" not-a-submodule 2>&1)" && out_rc=0 || out_rc=$?
  if [ "$out_rc" -ne 0 ] && grep -q 'not-a-submodule' <<<"$out"; then
    echo "  PASS  an undeclared path fails loud and is named"
  else
    echo "  FAIL  an undeclared path did not fail loud (rc=$out_rc): $out" >&2
    fails=$((fails + 1))
  fi

  # ── claim 8: a DERIVED path that is not declared fails loud (drift) ─────────
  cp "$fixture/charly.yml" "$BASE/charly.yml.bak"
  sed -i 's|- core: ./core|- core: ./not-declared|' "$fixture/charly.yml"
  out="$(bash "$SCRIPT" --root "$fixture" 2>&1)" && out_rc=0 || out_rc=$?
  if [ "$out_rc" -ne 0 ] && grep -q 'not-declared' <<<"$out"; then
    echo "  PASS  a derived path that is not a declared submodule fails loud and is named"
  else
    echo "  FAIL  a drifting derived path did not fail loud (rc=$out_rc): $out" >&2
    fails=$((fails + 1))
  fi
  cp "$BASE/charly.yml.bak" "$fixture/charly.yml"

  # ── claim 9: a checkout BEHIND its recorded gitlink is advanced TO it ───────
  # (the pin-wave half: the index moved, the checkout follows — but only when the
  # checkout is a strict ANCESTOR of the recorded gitlink, which claim 9 pins from
  # the other side).
  git -C "$fixture" update-index --cacheinfo "160000,$head_sha,core"
  out="$(bash "$SCRIPT" --root "$fixture" 2>&1)" && out_rc=0 || out_rc=$?
  local advanced_sha
  advanced_sha="$(git -C "$fixture/core" rev-parse HEAD 2>/dev/null || true)"
  if [ "$out_rc" -eq 0 ] && [ "$advanced_sha" = "$head_sha" ]; then
    echo "  PASS  a checkout behind its recorded gitlink is advanced to it"
  else
    echo "  FAIL  a checkout behind its recorded gitlink was not advanced (rc=$out_rc, HEAD $advanced_sha != $head_sha): $out" >&2
    fails=$((fails + 1))
  fi

  # ── claim 10: a checkout with its OWN commits is never clobbered (R6) ────────
  git -C "$fixture/extra" -c user.email=fixture@example.invalid -c user.name=fixture commit -q --allow-empty -m "local work"
  local local_sha
  local_sha="$(git -C "$fixture/extra" rev-parse HEAD)"
  out="$(bash "$SCRIPT" --root "$fixture" 2>&1)" && out_rc=0 || out_rc=$?
  local now_sha
  now_sha="$(git -C "$fixture/extra" rev-parse HEAD)"
  if [ "$out_rc" -ne 0 ] && [ "$now_sha" = "$local_sha" ] && grep -q 'extra' <<<"$out"; then
    echo "  PASS  a checkout with its own commits is reported, not clobbered"
  else
    echo "  FAIL  a diverged checkout was not left alone (rc=$out_rc, HEAD $now_sha != $local_sha): $out" >&2
    fails=$((fails + 1))
  fi

  # ── claim 11: a checkout that NEVER LANDED is REJECTED by the criterion ────
  # The state a killed run leaves: HEAD at the pin, an EMPTY index, an EMPTY
  # worktree. git calls that path FINE (' ' = at the recorded commit) — which
  # is exactly how a HEAD-only criterion passed a half-materialized tree
  # (measured: 385 of 431 paths, no files on disk).
  git -C "$fixture/corpus" rm -r --cached . >/dev/null 2>&1 || true
  rm -rf "$fixture/corpus"/* 2>/dev/null || true
  local broken_state broken_index broken_files
  broken_state="$(git -C "$fixture" submodule status -- corpus | cut -c1)"
  broken_index="$(git -C "$fixture/corpus" ls-files 2>/dev/null | wc -l)"
  broken_files="$(ls -A "$fixture/corpus" 2>/dev/null | grep -v '^\.git$' | wc -l || true)"
  out="$(bash "$SCRIPT" --root "$fixture" --check corpus 2>&1)" && out_rc=0 || out_rc=$?
  if [ "$broken_state" = " " ] && [ "$broken_index" -eq 0 ] && [ "$broken_files" -eq 0 ] && [ "$out_rc" -ne 0 ]; then
    echo "  PASS  the materialization criterion rejects a path that git calls fine (no index, no files)"
  else
    echo "  FAIL  the criterion did not reject the broken state (state='$broken_state' index=$broken_index files=$broken_files check-rc=$out_rc)" >&2
    fails=$((fails + 1))
  fi

  # ── claim 12: the run REPAIRS it, and the criterion then accepts it ───────
  out="$(bash "$SCRIPT" --root "$fixture" corpus 2>&1)" && out_rc=0 || out_rc=$?
  local fixed_index fixed_files fixed_sha want_sha
  fixed_index="$(git -C "$fixture/corpus" ls-files 2>/dev/null | wc -l)"
  fixed_files="$(ls -A "$fixture/corpus" 2>/dev/null | grep -v '^\.git$' | wc -l || true)"
  want_sha="$(git -C "$fixture" ls-files -s -- corpus | awk '{print $2}')"
  fixed_sha="$(git -C "$fixture/corpus" rev-parse HEAD 2>/dev/null || true)"
  if [ "$out_rc" -eq 0 ] && [ "$fixed_index" -gt 0 ] && [ "$fixed_files" -gt 0 ] && [ "$fixed_sha" = "$want_sha" ]; then
    echo "  PASS  a checkout that never landed is repaired (index and files are back, at the pin)"
  else
    echo "  FAIL  a checkout that never landed was not repaired (rc=$out_rc index=$fixed_index files=$fixed_files HEAD $fixed_sha != $want_sha): $out" >&2
    fails=$((fails + 1))
  fi
  out="$(bash "$SCRIPT" --root "$fixture" --check corpus 2>&1)" && out_rc=0 || out_rc=$?
  if [ "$out_rc" -eq 0 ]; then
    echo "  PASS  the criterion accepts the repaired path"
  else
    echo "  FAIL  the criterion still rejects the repaired path: $out" >&2
    fails=$((fails + 1))
  fi

  # ── claim 13: the ENVIRONMENT channel selects the mode ─────────────────────
  # `charly task init` has no operator value in its command text, so the mode
  # arrives in the environment. The claims below are the whole contract of that
  # channel — and they are all non-mutating, so the tree is untouched.
  local env_list
  env_list="$(CHARLY_INIT_MODE=list bash "$SCRIPT" --root "$fixture" 2>/dev/null | sed -n '1,/^init:/p' | grep -v '^init:' || true)"
  if [ "$env_list" = "$expected" ]; then
    echo "  PASS  CHARLY_INIT_MODE=list reports the working set and changes nothing"
  else
    echo "  FAIL  CHARLY_INIT_MODE=list reported the wrong set: $(printf '%s' "$env_list" | tr '\n' ' ')" >&2
    fails=$((fails + 1))
  fi
  # CHARLY_INIT_MODE=all asks for EVERY declared path. The --list flag is the
  # ACTION (print, change nothing) and the environment is the SET, so this
  # reports what `all` WOULD reach without touching the tree.
  env_list="$(CHARLY_INIT_MODE=all bash "$SCRIPT" --root "$fixture" --list 2>/dev/null | sed -n '1,/^init:/p' | grep -v '^init:' || true)"
  local declared_list
  declared_list="$(printf '%s\n' core corpus extra other skipped gated | sort)"
  if [ "$(printf '%s\n' "$env_list" | sort)" = "$declared_list" ]; then
    echo "  PASS  CHARLY_INIT_MODE=all reaches every declared path"
  else
    echo "  FAIL  CHARLY_INIT_MODE=all reported the wrong set: $(printf '%s' "$env_list" | tr '\n' ' ')" >&2
    fails=$((fails + 1))
  fi

  # ── claim 14: the ENVIRONMENT channel selects the paths (and splits them) ───
  env_list="$(CHARLY_INIT_PATHS=core,extra bash "$SCRIPT" --root "$fixture" --list 2>/dev/null | sed -n '1,/^init:/p' | grep -v '^init:' || true)"
  if [ "$env_list" = "$(printf 'core\nextra')" ]; then
    echo "  PASS  CHARLY_INIT_PATHS selects the named paths and splits the comma list"
  else
    echo "  FAIL  CHARLY_INIT_PATHS reported the wrong set: $(printf '%s' "$env_list" | tr '\n' ' ')" >&2
    fails=$((fails + 1))
  fi

  # ── claim 15: an UNKNOWN mode fails loud, names the value, and runs nothing ─
  # The injection instrument: a mode carrying a shell metacharacter must be
  # reported as a VALUE. It is compared, never spliced into a command line, so
  # the shell never parses it.
  local marker="$BASE/injected-marker"
  rm -f "$marker"
  out="$(CHARLY_INIT_MODE="all; touch $marker" bash "$SCRIPT" --root "$fixture" 2>&1)" && out_rc=0 || out_rc=$?
  if [ "$out_rc" -ne 0 ] && grep -q 'CHARLY_INIT_MODE' <<<"$out" && [ ! -e "$marker" ]; then
    echo "  PASS  an unknown mode fails loud, names the value, and executes nothing"
  else
    echo "  FAIL  an unknown mode did not fail loud safely (rc=$out_rc marker=$([ -e "$marker" ] && echo PRESENT || echo absent)): $out" >&2
    fails=$((fails + 1))
  fi

  # ── claim 16: the command line wins over the environment (the SET axis) ───
  env_list="$(CHARLY_INIT_MODE=all bash "$SCRIPT" --root "$fixture" --paths core,extra --list 2>/dev/null | sed -n '1,/^init:/p' | grep -v '^init:' || true)"
  if [ "$env_list" = "$(printf 'core\nextra')" ]; then
    echo "  PASS  the command line wins over the environment (the set axis)"
  else
    echo "  FAIL  the environment overrode the command line: $(printf '%s' "$env_list" | tr '\n' ' ')" >&2
    fails=$((fails + 1))
  fi
  env_list="$(CHARLY_INIT_PATHS=core bash "$SCRIPT" --root "$fixture" --all --list 2>/dev/null | sed -n '1,/^init:/p' | grep -v '^init:' || true)"
  if [ "$(printf '%s\n' "$env_list" | sort)" = "$declared_list" ]; then
    echo "  PASS  the command line wins over the environment (the other way round)"
  else
    echo "  FAIL  the environment overrode the command line: $(printf '%s' "$env_list" | tr '\n' ' ')" >&2
    fails=$((fails + 1))
  fi

  # ── claim 17: a DERIVATION THAT FAILS FAILS LOUD ─────────────────────────
  # The fail-open this claim exists for: `mapfile -t want < <(derive)` does NOT
  # propagate the process substitution's exit status, so a derivation that exited
  # non-zero produced an EMPTY set, and the run validated nothing, materialized
  # nothing and printed "init: OK — 0 of 0 requested path(s)" — a green run over
  # a derivation failure. Two broken derivations, both of which must stop the
  # run with a NAMED reason and NO "OK" line.
  local broken_manifest="$BASE/umbrella-nomanifest" broken_empty="$BASE/umbrella-empty"
  cp -a "$fixture" "$broken_manifest"
  rm -f "$broken_manifest/charly.yml"
  cp -a "$fixture" "$broken_empty"
  printf 'repo: github.com/opencharly/fixture\n' >"$broken_empty/charly.yml"
  # Every OTHER source must go too, or the derivation is not empty: source 3
  # reads reasonix.toml and the .dsh symlink farm, source 4 reads the gate
  # scripts.
  rm -f "$broken_empty/reasonix.toml"
  rm -rf "$broken_empty/.dsh" "$broken_empty/scripts"
  local derivation_bad=0
  for variant in absent empty; do
    local vroot vout vrc
    if [ "$variant" = "absent" ]; then vroot="$broken_manifest"; else vroot="$broken_empty"; fi
    vout="$(bash "$SCRIPT" --root "$vroot" 2>&1)" && vrc=0 || vrc=$?
    if [ "$vrc" -eq 0 ]; then
      echo "  FAIL  a $variant derivation did not fail loud (rc=0): $vout" >&2
      derivation_bad=1
    elif grep -q 'init: OK' <<<"$vout"; then
      echo "  FAIL  a $variant derivation still printed an OK line: $vout" >&2
      derivation_bad=1
    elif grep -q '0 of 0 requested' <<<"$vout"; then
      echo "  FAIL  a $variant derivation reported '0 of 0 requested path(s)': $vout" >&2
      derivation_bad=1
    elif ! grep -qi 'deriv' <<<"$vout"; then
      echo "  FAIL  a $variant derivation failed without naming the derivation: $vout" >&2
      derivation_bad=1
    fi
  done
  if [ "$derivation_bad" -eq 0 ]; then
    echo "  PASS  a derivation that fails (absent manifest, empty derivation) fails loud and never reports 0 of 0"
  else
    fails=$((fails + 1))
  fi

  # ── claim 18: a DIRECT --land on a dirty checkout is REFUSED ──────────────
  # `land_pin` is the one thing here that touches a checkout, and it ends in
  # `checkout -f --detach`, which DISCARDS tracked changes. The no-clobber guard
  # therefore lives INSIDE land_pin, so it holds for a direct invocation and not
  # only for the repair pass that usually calls it.
  echo "dirt" >"$fixture/core/file.txt"
  local land_out land_rc land_head land_file
  land_out="$(bash "$SCRIPT" --root "$fixture" --land core 2>&1)" && land_rc=0 || land_rc=$?
  land_head="$(git -C "$fixture/core" rev-parse HEAD 2>/dev/null || true)"
  land_file="$(cat "$fixture/core/file.txt" 2>/dev/null || true)"
  if [ "$land_rc" -ne 0 ] && [ "$land_file" = "dirt" ] && [ "$land_head" = "$head_sha" ]; then
    echo "  PASS  a direct --land on a dirty checkout is refused and the work survives"
  else
    echo "  FAIL  a direct --land clobbered a dirty checkout (rc=$land_rc, file='$land_file', HEAD $land_head != $head_sha): $land_out" >&2
    fails=$((fails + 1))
  fi

  if [ "$fails" -ne 0 ]; then
    echo "init-submodules --self-test: FAIL ($fails)" >&2
    return 1
  fi
  echo "init-submodules --self-test: OK (every claim is live)"
}

case "$MODE" in
  self-test) run_self_test ;;
  land) land_pin "$LAND" ;;
  check)
    if is_materialized "$CHECK"; then
      echo "materialized: $CHECK"
    else
      echo "NOT materialized: $CHECK (HEAD $(git -C "$ROOT/$CHECK" rev-parse HEAD 2>/dev/null || echo '<none>'), index $(submodule_index_count "$CHECK") file(s), worktree $(submodule_worktree_count "$CHECK") entry(ies))" >&2
      exit 1
    fi
    ;;
  *) run_live ;;
esac
