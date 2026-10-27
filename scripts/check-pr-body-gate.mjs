#!/usr/bin/env node
// check-pr-body-gate.mjs — regression gate for the umbrella's PRE-PUSH body gate
// (`hooks/pre-push`, the clone-level git hook installed by `charly task hooks`).
//
// Why it exists (opencharly/marketplace#404). The org judges PR bodies with its own
// linter (`marketplace/scripts/pr_body_lint.py`), and the validator reads the body
// LIVE — so every body defect that linter can catch mechanically (a missing required
// section, a trailer that is not the last line, a bare `N/A`, an ellipsized fence, a
// pasted head SHA that is not HEAD) was being paid for in review rounds instead of
// seconds. The linter existed; nothing RAN it before the push. This file is the hook's
// assertion, in the shape this wave settled on: static readings over the shipped text
// PLUS assertions that FIRE the real hook against real git repositories, each proven
// to go RED by a mutation.
//
// Why firing, not just reading (the wave's second lesson): a claim about a mechanism
// must be verified THROUGH the mechanism. A regex cannot see whether the hook's
// missing-body branch exits 0, whether the git-dir default actually resolves in a
// linked worktree, or whether a lint finding reaches the push — only running it can.
//
// Usage: node scripts/check-pr-body-gate.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const rel = "hooks/pre-push";
const file = join(root, rel);

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);

/**
 * Strip a SHELL file's comments, so the assertions read CODE and not the prose
 * explaining it. A shell comment starts at a `#` that begins a word and is not inside
 * quotes; there are no block comments.
 *
 * The first version of this file also stripped C-style block comments, and that was a
 * live defect: the hook's `refs/heads/` glob opened a "block comment" that ran to the
 * next block-comment terminator — 2607 characters, the whole live-body check — so the
 * assertions read a mutilated file and could not see the code they were about. The
 * missed control was reading the SHIPPED text with a reader built for another
 * language.
 */
function stripComments(src) {
  const out = [];
  for (const line of src.split("\n")) {
    let kept = "";
    let quote = null;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (quote) {
        kept += c;
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        kept += c;
        continue;
      }
      if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) break;
      kept += c;
    }
    out.push(kept);
  }
  return out.join("\n");
}

function check() {
  if (!existsSync(file)) {
    fail(`${rel} exists`);
    return;
  }
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);

  // 1. Executable, because git silently IGNORES a non-executable hook: a mode bit lost
  //    in a commit turns the gate off with no error anywhere.
  const mode = (() => {
    try {
      return Number((spawnSync("stat", ["-c", "%a", file], { encoding: "utf8" }).stdout ?? "").trim());
    } catch {
      return 0;
    }
  })();
  if (!(mode & 0o111)) fail(`${rel} is executable (mode ${mode.toString(8)})`);

  // 2. The body path convention: the GIT DIR by default, overridable, and never the
  //    tracked tree (a body committed into the worktree is a body that dirties it and
  //    that two worktrees would fight over).
  if (!/--absolute-git-dir/.test(code)) fail(`resolves the body path from the git dir (--absolute-git-dir)`);
  if (!/PR_BODY_FILE/.test(code)) fail(`honours a PR_BODY_FILE override`);
  if (/\$\{PR_BODY_FILE:-\$?ROOT\//.test(code)) fail(`does not default the body path into the tracked tree`);

  // 3. The two SKIPS must not fail closed: a missing body is the discipline failing, and
  //    an unmaterialized `marketplace` submodule would otherwise make every fresh
  //    worktree unlandable. Both branches must exit 0 and SAY what to do.
  const absentBodyBranch = /if \[ ! -e "\$BODY" \]; then([\s\S]*?)\nfi/.exec(code)?.[1] ?? "";
  if (!absentBodyBranch) fail(`has an explicit missing-body branch`);
  else if (!/exit 0/.test(absentBodyBranch)) fail(`a missing body SKIPS (exit 0) instead of failing closed`);
  const absentLintBranch = /if \[ ! -f "\$LINT" \]; then([\s\S]*?)\nfi/.exec(code)?.[1] ?? "";
  if (!absentLintBranch) fail(`has an explicit missing-linter branch`);
  else if (!/exit 0/.test(absentLintBranch)) fail(`a missing linter SKIPS (exit 0) instead of failing closed`);
  if (!/marketplace\/scripts\/pr_body_lint\.py/.test(code)) fail(`names the marketplace body linter it runs`);

  // 4. The umbrella's OWN reconciliation must be wired in: the linter judges the body's
  //    FORM, and nothing anywhere judged the body's FIDELITY TO THE DIFF it ships with.
  //    The validator caught all three of that class on this repo's own PR (2026-10-23),
  //    a whole round after the push that could have been stopped here.
  if (!/scripts\/check-pr-body-diff\.mjs/.test(code)) fail(`runs the umbrella's body/diff reconciliation`);
  if (!/node "\$RECONCILE"/.test(code)) fail(`runs the reconciliation with node`);
  if (!/BLOCKED — the PR body does not describe the diff/.test(code))
    fail(`blocks a body that does not describe the diff it is published with`);

  // 5. The LIVE body — the SECOND surface. The body this hook validates is a FILE; the
  //    validator reads the PR's LIVE copy, from GitHub. Nothing reconciled the two, so a
  //    body FILE that was correct while the PR's body was stale passed this hook
  //    PERFECTLY and cost a whole review round: opencharly/opencharly#742 (2026-10-27)
  //    published a body the reviewer never saw, because the file was fixed after the push
  //    and the PR's copy was not. The control that closes that gap must be WIRED IN, and
  //    it must BLOCK on a disagreement — a warning would not have stopped that push.
  if (!/gh pr list/.test(code)) fail(`resolves the PR the live body belongs to`);
  if (!/gh pr view/.test(code)) fail(`reads the PR's live body`);
  if (!/BLOCKED — the LIVE body/.test(code)) fail(`blocks a push whose live body is not the body it validated`);
  if (!/gh is not installed/.test(code)) fail(`names the live-body check's skip when gh is absent`);

  // 6. GIT'S OWN CONTRACT, not a guess. A pre-push hook is given TWO arguments — the
  //    remote NAME and its URL — and the refs it publishes on STDIN. There is NO $3.
  //    The merged hook read a third argument git never sets, so the published branch
  //    always fell back to HEAD's, and it always used the remote `origin`: a push of
  //    any branch other than the checked-out one, or to any remote other than
  //    `origin`, compared the body against the WRONG PR — a false PASS and a false
  //    BLOCK, from the same hook.
  if (!/PUSH_REFS/.test(code)) fail(`reads the published refs from the hook's stdin`);
  if (!/refs\/heads\/\*/.test(code)) fail(`takes the published branch from the remote ref git publishes`);
  if (/\$\{3:-\}/.test(code)) fail(`reads no third argument for the pushed ref (git hands the hook $1 and $2 only)`);
  if (!/\$\{2:-\}/.test(code)) fail(`takes the pushed remote's URL from the hook's own $2`);

  // 7. The skip COUNTS the header states must be the counts the CODE has. The merged
  //    hook's own comment said "four" where the code carried six skip paths — a claim
  //    about the product that had already drifted, and the drift was invisible because
  //    nothing compared the two. The count is stated once, in a form a machine can
  //    read, and the markers in the CODE are what it is checked against.
  const stated = /SKIP COUNTS: hook=(\d+) live-body=(\d+)/.exec(raw);
  const hookSkips = (code.match(/\[pre-push-skip\]/g) ?? []).length;
  const liveSkips = (code.match(/\[live-body-skip\]/g) ?? []).length;
  if (!stated) fail(`states its skip counts (SKIP COUNTS: hook=N live-body=N)`);
  else {
    if (Number(stated[1]) !== hookSkips)
      fail(`the header's hook skip count (${stated[1]}) matches the code's ${hookSkips} marked skip path(s)`);
    if (Number(stated[2]) !== liveSkips)
      fail(`the header's live-body skip count (${stated[2]}) matches the code's ${liveSkips} marked skip path(s)`);
  }

  if (failures === 0)
    ok(
      `${rel}: executable, git-dir body path with an override, both skips visible and never fail-closed, ` +
        `and it runs the marketplace body linter; its skip counts (hook=${hookSkips} live-body=${liveSkips}) ` +
        `match the code`,
    );
}

// ── the fired assertions ────────────────────────────────────────────────────────────
// Every fixture is a REAL git repository and the REAL linter; the hook is run as git
// runs it — by path, with the repository as its cwd. The only thing synthesised is the
// body under test.

/** A body the linter accepts: the four required sections, all rules answered, trailer last. */
const GOOD_BODY = `## Summary
Fixture body proving the pre-push hook's decision.

## How tested
\`\`\`
$ true
\`\`\`

## Rulebook compliance
- **R0 — skills first:** fixture.
- **R1 — RCA every anomaly:** N/A — no anomaly in this fixture.
- **R2 — no duplication:** fixture.
- **R3 — no workarounds:** fixture.
- **R4 — fix the product first:** fixture.
- **R5 — delete legacy completely:** fixture.
- **R6 — git safety:** fixture.
- **R7 — prove behaviour, not compilation (+ emitted artifacts):** fixture.
- **R8 — live or skip:** fixture.
- **R9 — binary equals source:** fixture.
- **R10 — fresh disposable proof:** fixture.

## Change classification
Test fixture, not a real change.

*Assisted-by: DeepSeek Harness ollama-cloud/deepseek-v4.1-flash (documentation reviewed)*
`;

/** A body the linter rejects on form alone. */
const BAD_BODY = "# not a PR body\n";

/**
 * A body the linter accepts that carries the two shapes the umbrella's OWN
 * reconciliation reads: a file table and a pasted `git rev-parse HEAD`. It is
 * GOOD_BODY's sections — one definition of the required form — with those two added.
 */
const tableBody = (headSha, rows) =>
  GOOD_BODY.replace(
    "Fixture body proving the pre-push hook's decision.",
    `Fixture body proving the pre-push hook's decision.\n\n| file | what it carries |\n|---|---|\n${rows}`,
  ).replace("$ true", `$ git rev-parse HEAD\n${headSha}`);

async function fire() {
  // The linter lives in the marketplace SUBMODULE, which a DEFAULT fresh session worktree does
  // not have. SKIP VISIBLY rather than fail: this checker is wired into `hooks/pre-commit`, so a
  // checker that failed closed on an unmaterialized submodule would make every fresh worktree's
  // commit gate red — the exact fail-closed-infrastructure class the hook it asserts exists to
  // avoid, and the contradiction a reviewer caught in the first version of this file. Live-or-
  // skip, never a silent pass: the skip is printed and names the one command that fixes it.
  const lintSrc = join(root, "marketplace/scripts");
  const lintPresent = existsSync(join(lintSrc, "pr_body_lint.py"));
  if (!lintPresent) {
    // Only the arms that need the ORG LINTER are skipped. The LIVE-body arms do not: the
    // live-body check runs BEFORE the linter, so a checkout without the marketplace
    // submodule can still prove the hook's live-body contract. The first version of this
    // file skipped EVERY fired assertion here, while its own self-test said the
    // live-body mutations were "live in a checkout without the submodule" — so the gate
    // reported mutations it could not catch as failures, and a light checkout's
    // self-test was RED. The skip is scoped to what it can actually skip, and it is
    // printed.
    console.log(
      `  SKIP  ${rel} fired assertions that need the org linter: ${lintSrc} is absent (the marketplace submodule is not materialized in this checkout)`,
    );
    console.log(`  SKIP  materialize it with: bash scripts/init-submodules.sh  (the working set includes the marketplace)`);
  }
  const scratch = mkdtempSync(join(tmpdir(), "check-pr-body-gate-"));
  const repo = join(scratch, "repo");
  const expect = (cond, msg) => (cond ? ok(msg) : fail(msg));
  const skip = (msg) => console.log(`  SKIP  ${msg}`);
  try {
    // A real repository with a real HEAD: the linter reads the head SHA from it, and a
    // repository without one would fail for a reason that has nothing to do with the hook.
    mkdirSync(repo, { recursive: true });
    const git = (...a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    // A GitHub REMOTE, so the hook's live-body check can resolve a PR for the branch it
    // is pushing. The reconciler reads only LOCAL git (diff, log, rev-parse), so a remote
    // URL here never reaches the network — the PR itself is answered by the stub below.
    git("remote", "add", "origin", "https://github.com/opencharly/opencharly.git");
    // A SECOND remote and a SECOND branch, so an arm can prove the hook asked about the
    // branch and the remote the PUSH named, and not the ones the checkout happens to
    // carry. A fixture with one branch and one remote cannot tell a wrong branch from
    // the right one — that is exactly why the merged gate could not see the defect.
    git("remote", "add", "fork", "https://github.com/other/repo.git");
    git("config", "user.email", "gate@gate");
    git("config", "user.name", "gate");
    writeFileSync(join(repo, "f.txt"), "x\n");
    git("add", "-A");
    writeFileSync(join(scratch, "msg.txt"), "base\n");
    git("commit", "-q", "-F", join(scratch, "msg.txt"));
    // A base ref for the reconciliation to diff against, and a commit on top of it, so
    // the diff is not empty: `origin/main` is a LOCAL ref here (the scratch repository has
    // no remote), and HEAD carries a change the base does not.
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    writeFileSync(join(repo, "f.txt"), "y\n");
    writeFileSync(join(repo, "g.txt"), "g\n");
    git("add", "-A");
    git("commit", "-q", "-F", join(scratch, "msg.txt"));
    const changedSha = git("rev-parse", "HEAD").stdout.trim();
    // A second branch, at the same commit. The checkout stays on `main`; a push of
    // `other` must be checked against `other`'s PR, not `main`'s.
    git("branch", "other");

    // The stub `gh`, created BEFORE the first arm and on the PATH for EVERY arm: the PR
    // is a real boundary, so it is answered with a real tool rather than by mocking the
    // hook's own logic, and no arm ever reaches the network. It answers exactly the two
    // calls the hook makes, from a MAP FILE keyed by (REPOSITORY, BRANCH) — the two
    // facts git hands the hook — so one fixture can hold a DIFFERENT PR for every
    // branch and every remote, and the hook cannot pass by reading the wrong one.
    const stubBin = join(scratch, "bin");
    mkdirSync(stubBin, { recursive: true });
    const stubGh = join(stubBin, "gh");
    writeFileSync(
      stubGh,
      [
        "#!/usr/bin/env bash",
        "# A stub gh for the pre-push hook's LIVE-body check.",
        "#",
        "# The PR a push belongs to is keyed by (REPOSITORY, BRANCH) — the two facts git",
        "# hands the hook — so one fixture can hold a different PR for every branch and",
        "# every remote, and the hook cannot pass by reading the wrong one.",
        'if [ "${STUB_GH_FAIL:-}" != "" ]; then',
        '  echo "stub gh: simulated failure" >&2',
        "  exit 4",
        "fi",
        'map="${STUB_PR_MAP:-}"',
        'repo=""; head=""; prev=""',
        'for a in "$@"; do',
        '  case "$prev" in',
        '    --repo) repo="$a" ;;',
        '    --head) head="$a" ;;',
        "  esac",
        '  prev="$a"',
        "done",
        'if [ "$1" = "pr" ] && [ "$2" = "list" ]; then',
        '  if [ -n "$map" ] && [ -f "$map" ]; then',
        "    while IFS=$'\\t' read -r r b p f; do",
        '      [ -z "$r" ] && continue',
        '      if [ "$r" = "$repo" ] && [ "$b" = "$head" ]; then printf "%s" "$p"; exit 0; fi',
        '    done < "$map"',
        "  fi",
        "  exit 0",
        "fi",
        'if [ "$1" = "pr" ] && [ "$2" = "view" ]; then',
        '  pr="${3:-}"',
        '  if [ -n "$map" ] && [ -f "$map" ]; then',
        "    while IFS=$'\\t' read -r r b p f; do",
        '      [ -z "$r" ] && continue',
        '      if [ "$r" = "$repo" ] && [ "$p" = "$pr" ] && [ -n "$f" ] && [ -f "$f" ]; then cat "$f"; exit 0; fi',
        '    done < "$map"',
        "  fi",
        "  exit 0",
        "fi",
        'echo "stub gh: unexpected call: $*" >&2',
        "exit 64",
        "",
      ].join("\n"),
    );
    chmodSync(stubGh, 0o755);
    const prMap = join(scratch, "pr-map.tsv");
    const writePrMap = (entries) =>
      writeFileSync(prMap, entries.map((e) => e.join("\t")).join("\n") + (entries.length ? "\n" : ""));

    // Run the shipped hook (or a mutated copy) with the repository as cwd, as git does,
    // with the args git hands it (the remote NAME and its URL) and the refs it publishes
    // on stdin.
    const hook = join(scratch, "hook.sh");
    cpSync(file, hook);
    chmodSync(hook, 0o755);
    const run = (env = {}, args = [], stdin = "") => {
      const r = spawnSync("bash", [hook, ...args], {
        cwd: repo,
        encoding: "utf8",
        input: stdin,
        env: { ...process.env, PATH: `${stubBin}:${process.env.PATH}`, ...env },
      });
      return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
    };
    const gitDir = git("rev-parse", "--absolute-git-dir").stdout.trim();
    const defaultBody = join(gitDir, "PR_BODY.md");

    // The umbrella's OWN reconciliation travels WITH the hook: the hook runs it out of
    // the repository it is pushing, so the scratch repository needs its own copy — and
    // it is the COPY that is fired, exactly as a real clone's is.
    const reconciler = join(root, "scripts/check-pr-body-diff.mjs");
    if (!existsSync(reconciler)) {
      fail(`scripts/check-pr-body-diff.mjs is present (the hook runs it out of the repository it pushes)`);
      return;
    }
    mkdirSync(join(repo, "scripts"), { recursive: true });
    cpSync(reconciler, join(repo, "scripts/check-pr-body-diff.mjs"));
    // The reconciler reads the ONE cap from `scripts/lib/pr-body-cap`, beside itself.
    // The copy travels with it, for the same reason the reconciler does: the hook runs
    // the COPY, and a copy without its cap file would read no cap and fail loud — a
    // finding about the fixture, not about the body.
    mkdirSync(join(repo, "scripts/lib"), { recursive: true });
    cpSync(join(root, "scripts/lib/pr-body-cap"), join(repo, "scripts/lib/pr-body-cap"));

    // The linter as the hook finds it: <repo>/marketplace/scripts/pr_body_lint.py — and it
    // imports a SIBLING module (`squash_body.py`), so the directory is copied WHOLE. A
    // one-file copy makes it die with a traceback that ALSO exits 1, which is exactly how an
    // assertion passes for the wrong reason: the first version of this file asserted only
    // "exit 1" for the defective body and was satisfied by a crash, not by a finding.
    const lintDst = join(repo, "marketplace/scripts");
    const installLinter = () => {
      mkdirSync(join(repo, "marketplace"), { recursive: true });
      cpSync(lintSrc, lintDst, { recursive: true });
    };
    const installLinterWithoutSiblings = () => {
      mkdirSync(lintDst, { recursive: true });
      cpSync(join(lintSrc, "pr_body_lint.py"), join(lintDst, "pr_body_lint.py"));
    };

    // F1 — a body with form defects is BLOCKED at the push BY A FINDING, through the DEFAULT
    //      path (no PR_BODY_FILE), which is what proves the git-dir convention end to end.
    if (lintPresent) {
      installLinter();
      writeFileSync(defaultBody, BAD_BODY);
      const bad = run();
      expect(
        bad.code === 1 && /BLOCKED/.test(bad.out) && /FAIL {2}sections:/.test(bad.out),
        `hooks/pre-push FIRED: a defective body is BLOCKED at the push (exit 1) by the linter's own FAIL finding, found at the git-dir default`,
      );
    } else {
      skip(
        `hooks/pre-push FIRED: a defective body is BLOCKED at the push — the org linter is not materialized in this checkout, so there is no finding to be blocked by`,
      );
    }

    // F2 — a well-formed body passes.
    if (lintPresent) {
      writeFileSync(defaultBody, GOOD_BODY);
      const good = run();
      expect(good.code === 0 && /pre-push: OK/.test(good.out), `hooks/pre-push FIRED: a well-formed body passes (exit 0)`);
    } else {
      skip(`hooks/pre-push FIRED: a well-formed body passes — the org linter is not materialized in this checkout`);
    }

    // F3 — NO body: skip visibly and do NOT fail closed (a missing body is the discipline
    //      failing, not a defect in the diff).
    rmSync(defaultBody, { force: true });
    const missing = run();
    expect(
      missing.code === 0 && /SKIPPED/.test(missing.out) && missing.out.includes("PR_BODY.md"),
      `hooks/pre-push FIRED: no body SKIPS visibly (exit 0) and names the path to create`,
    );

    // F4 — the linter is absent (an unmaterialized marketplace submodule in a fresh
    //      worktree): skip visibly, never block the push for a missing tool. The override
    //      is exercised here too.
    const elsewhere = join(scratch, "elsewhere.md");
    writeFileSync(elsewhere, GOOD_BODY);
    rmSync(join(repo, "marketplace"), { recursive: true, force: true });
    const noLint = run({ PR_BODY_FILE: elsewhere });
    expect(
      noLint.code === 0 && /SKIPPED/.test(noLint.out) && /marketplace/.test(noLint.out),
      `hooks/pre-push FIRED: a missing linter SKIPS visibly (exit 0) and names the fix; PR_BODY_FILE is honoured`,
    );

    // F5 — the linter EXISTS but cannot RUN, because its sibling module is missing — the exact
    //      shape a partial submodule materialization produces. A tool that cannot run is NOT a
    //      finding, and exit code alone cannot tell the two apart (a traceback also exits 1),
    //      which is why the hook pre-flights with `--help`. It must skip visibly, never block.
    rmSync(join(repo, "marketplace"), { recursive: true, force: true });
    writeFileSync(defaultBody, GOOD_BODY);
    if (lintPresent) {
      installLinterWithoutSiblings();
      const brokenLint = run();
      expect(
        brokenLint.code === 0 && /cannot run here/.test(brokenLint.out),
        `hooks/pre-push FIRED: a linter that cannot run SKIPS visibly (exit 0) instead of blocking a legitimate push`,
      );
    } else {
      skip(
        `hooks/pre-push FIRED: a linter that cannot run SKIPS visibly — the org linter is not materialized in this checkout`,
      );
    }

    // F6 — a body whose FILE TABLE lists a file the diff does not change is BLOCKED at
    //      the push. This is the class the linter cannot see (it judges form, and never
    //      reads the diff) and the validator caught on this repo's own PR, a whole round
    //      after the push that could have been stopped here.
    writeFileSync(defaultBody, tableBody(changedSha, "| `f.txt` | a change |\n| `g.txt` | a change |"));
    const cleanTable = run();
    expect(
      cleanTable.code === 0,
      `hooks/pre-push FIRED: a body whose file table matches the diff passes (exit 0)`,
    );
    writeFileSync(defaultBody, tableBody(changedSha, "| `f.txt` | a change |\n| `g.txt` | a change |\n| `ghost.txt` | a change |"));
    const phantom = run();
    expect(
      phantom.code === 1 && /does not describe the diff/.test(phantom.out),
      `hooks/pre-push FIRED: a body whose file table lists a file the diff does not change is BLOCKED at the push`,
    );

    // F7 — a body whose pasted `git rev-parse HEAD` is NOT the head being pushed is
    //      BLOCKED: the evidence was taken on another tree than the body claims.
    writeFileSync(defaultBody, tableBody("0".repeat(40), "| `f.txt` | a change |\n| `g.txt` | a change |"));
    const staleHead = run();
    expect(
      staleHead.code === 1 && /does not describe the diff/.test(staleHead.out),
      `hooks/pre-push FIRED: a body whose pasted \`git rev-parse HEAD\` is not the head being pushed is BLOCKED at the push`,
    );

    // F8 — a body whose fences DO NOT PAIR is BLOCKED. The org linter reads the body's
    //      LINES, so a heading inside an unpaired fence counts as a present section and
    //      the body shows none; the reconciler is the arm that sees it.
    writeFileSync(defaultBody, GOOD_BODY.replace("```\n$ true\n```", "```\n$ true"));
    const unpaired = run();
    expect(
      unpaired.code === 1 && /fences do not pair/.test(unpaired.out),
      `hooks/pre-push FIRED: a body whose fences do not pair is BLOCKED at the push, and the finding names the fences`,
    );

    // F9 — a body OVER the cap is BLOCKED, and the finding names the cap. The cap is
    //      the ONE number, overridden here to a small one so the fixture body is over
    //      it without a 64 KiB fixture: the override is the same knob the cap file
    //      documents, and both readers honour it.
    writeFileSync(defaultBody, GOOD_BODY);
    const overCap = run({ GITHUB_BODY_MAX: "100" });
    expect(
      overCap.code === 1 && /GitHub cap/.test(overCap.out),
      `hooks/pre-push FIRED: a body over the size cap is BLOCKED at the push, and the finding names the cap`,
    );

    // ── the LIVE body: the SECOND surface, and the one the validator reads ──────────
    // The PR is a real boundary, so it is answered with a real tool — the stub `gh` on
    // the PATH, above — rather than by mocking the hook's own logic. What each PR holds
    // comes from the MAP, keyed by (repository, branch): the two facts git hands the
    // hook, so one fixture holds a DIFFERENT PR for every branch and every remote, and
    // the hook cannot pass by reading the wrong one.
    if (lintPresent) installLinter();
    writeFileSync(defaultBody, GOOD_BODY);
    const liveBodyFile = join(scratch, "live-body.md");
    const otherBodyFile = join(scratch, "other-body.md");
    const forkBodyFile = join(scratch, "fork-body.md");
    writeFileSync(liveBodyFile, GOOD_BODY);
    writeFileSync(
      otherBodyFile,
      GOOD_BODY.replace("Fixture body proving", "A body PR #222 holds that is not the file this hook validated"),
    );
    writeFileSync(
      forkBodyFile,
      GOOD_BODY.replace("Fixture body proving", "A body PR #333 holds that is not the file this hook validated"),
    );
    // `main` on `origin` is the PR a hand-run or a nothing-to-do push resolves; `other`
    // on `origin` is a DIFFERENT PR; `main` on `fork` is a DIFFERENT REPOSITORY.
    const mapMain = ["opencharly/opencharly", "main", "742", liveBodyFile];
    const mapOther = ["opencharly/opencharly", "other", "222", otherBodyFile];
    const mapFork = ["other/repo", "main", "333", forkBodyFile];
    writePrMap([mapMain, mapOther, mapFork]);
    const liveEnv = { STUB_PR_MAP: prMap };

    // What git writes to the hook's stdin when a push publishes a ref: the LOCAL ref,
    // its SHA, the REMOTE ref, and the SHA it lands on.
    const publishedMain = `refs/heads/main ${changedSha} refs/heads/main ${changedSha}\n`;
    const publishedOther = `refs/heads/other ${changedSha} refs/heads/other ${changedSha}\n`;
    const publishedTag = `refs/tags/v1 ${changedSha} refs/tags/v1 ${changedSha}\n`;

    // F10 — the LIVE body MATCHES the body this hook validated: the push proceeds, and
    //      the match is named — so the arm cannot be satisfied by a later skip.
    const matching = run(liveEnv);
    expect(
      matching.code === 0 && /LIVE body on .*#742 MATCHES/.test(matching.out),
      `hooks/pre-push FIRED: a PR whose LIVE body matches the validated body passes (exit 0), and the match is named`,
    );

    // F11 — the LIVE body DIFFERS: the push is BLOCKED, and the finding names the PR and
    //      the fix. This is the arm opencharly/opencharly#742 needed and did not have.
    writeFileSync(
      liveBodyFile,
      GOOD_BODY.replace("Fixture body proving", "A body the PR holds that is not the file"),
    );
    const staleLive = run(liveEnv);
    expect(
      staleLive.code === 1 &&
        /BLOCKED — the LIVE body on .*#742/.test(staleLive.out) &&
        /gh pr edit 742/.test(staleLive.out),
      `hooks/pre-push FIRED: a PR whose LIVE body does NOT match the validated body is BLOCKED at the push, and the finding names the PR and the fix`,
    );
    writeFileSync(liveBodyFile, GOOD_BODY);

    // F12 — no open PR for the branch: the FIRST push OPENS the PR, so there is nothing
    //      to compare yet. A visible skip, never a block.
    writePrMap([mapOther, mapFork]);
    const noPr = run(liveEnv);
    expect(
      noPr.code === 0 && /no open PR/.test(noPr.out),
      `hooks/pre-push FIRED: a branch with no open PR SKIPS the LIVE-body check visibly (exit 0)`,
    );
    writePrMap([mapMain, mapOther, mapFork]);

    // F13 — gh ITSELF fails: a tool that cannot answer is not a finding. Visible skip.
    const brokenGh = run({ ...liveEnv, STUB_GH_FAIL: "1" });
    expect(
      brokenGh.code === 0 && /gh could not list the open PRs/.test(brokenGh.out),
      `hooks/pre-push FIRED: gh failing SKIPS the LIVE-body check visibly (exit 0) instead of blocking a legitimate push`,
    );

    // F14 — gh is NOT INSTALLED: the same doctrine, proven by a PATH that holds every
    //      tool the hook reaches for EXCEPT gh. The farm is built from the RESOLVED PATH
    //      — the directories this process actually has — and not from a hard-coded list
    //      of three: the merged gate hard-coded /usr/local/bin, /usr/bin and /bin, so on
    //      a host whose node lives in nvm or homebrew the farm held no node, the
    //      reconciliation was silently skipped, and the arm passed while exercising none
    //      of what it was written to exercise. The arm proves the farm is built from the
    //      resolved PATH by putting a tool in a directory that is NOT one of the three
    //      and asserting the farm still holds it.
    const noGhBin = join(scratch, "nogh-bin");
    mkdirSync(noGhBin, { recursive: true });
    const toolBin = join(scratch, "toolbin");
    mkdirSync(toolBin, { recursive: true });
    symlinkSync(process.execPath, join(toolBin, "node"));
    const hostPath = `${toolBin}:${process.env.PATH ?? ""}`;
    for (const dir of hostPath.split(":").filter(Boolean)) {
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir)) {
        if (entry === "gh") continue;
        const target = join(noGhBin, entry);
        if (existsSync(target)) continue;
        try {
          symlinkSync(join(dir, entry), target);
        } catch (e) {
          void e; // a name that cannot be linked is not this arm's concern
        }
      }
    }
    const farmNode = join(noGhBin, "node");
    const farmNodeTarget = existsSync(farmNode) ? readlinkSync(farmNode) : "";
    expect(
      farmNodeTarget === join(toolBin, "node"),
      `the no-gh farm is built from the RESOLVED PATH, so it holds a tool that lives outside the three directories the merged gate hard-coded`,
    );
    const noGh = run({ PATH: noGhBin });
    expect(
      noGh.code === 0 && /gh is not installed/.test(noGh.out),
      `hooks/pre-push FIRED: without gh the LIVE-body check SKIPS visibly (exit 0) instead of blocking a legitimate push`,
    );

    // F15 — the PUBLISHED branch is not the checked-out one. The push publishes `other`
    //      while the checkout sits on `main`, so the hook must ask about `other`'s PR —
    //      #222 — and not about `main`'s. RED without the fix: the merged hook read a
    //      third argument git never sets and always fell back to HEAD's branch, so it
    //      compared the body against the WRONG PR — a false PASS here, a false BLOCK
    //      there.
    const wrongBranch = run(liveEnv, ["origin", "https://github.com/opencharly/opencharly.git"], publishedOther);
    expect(
      wrongBranch.code === 1 && /BLOCKED — the LIVE body on opencharly\/opencharly#222/.test(wrongBranch.out),
      `hooks/pre-push FIRED: a push that publishes a branch OTHER than the checked-out one is checked against THAT branch's PR, not the checkout's`,
    );

    // F16 — the same push, against a PR whose body MATCHES: the push proceeds. With F15
    //      this proves the hook asks about the PUBLISHED branch, not about the one that
    //      happens to be checked out.
    writePrMap([mapMain, ["opencharly/opencharly", "other", "222", liveBodyFile], mapFork]);
    const rightBranch = run(liveEnv, ["origin", "https://github.com/opencharly/opencharly.git"], publishedOther);
    expect(
      rightBranch.code === 0 && /LIVE body on opencharly\/opencharly#222 MATCHES/.test(rightBranch.out),
      `hooks/pre-push FIRED: a push that publishes a branch other than the checked-out one passes when THAT branch's PR holds the same body`,
    );
    writePrMap([mapMain, mapOther, mapFork]);

    // F17 — a push that publishes a TAG: there is no branch to resolve a PR from, so the
    //      check SKIPS visibly. It must not fall back to the checkout's branch and
    //      compare the body against an unrelated PR.
    const tagged = run(liveEnv, ["origin", "https://github.com/opencharly/opencharly.git"], publishedTag);
    expect(
      tagged.code === 0 &&
        /no single branch to resolve a PR from/.test(tagged.out) &&
        !/LIVE body on/.test(tagged.out),
      `hooks/pre-push FIRED: a push that publishes a TAG skips the LIVE-body check visibly (exit 0) instead of comparing against the checkout's PR`,
    );

    // F18 — the push names a remote OTHER than `origin`: the PR that holds the body is
    //      the one in THAT repository. The merged hook always used `origin`, so a push
    //      to a fork was compared against the upstream repository's PR.
    const pushedFork = run(liveEnv, ["fork", "https://github.com/other/repo.git"], publishedMain);
    expect(
      pushedFork.code === 1 && /BLOCKED — the LIVE body on other\/repo#333/.test(pushedFork.out),
      `hooks/pre-push FIRED: a push to a remote other than origin is checked against THAT remote's PR, not against origin's`,
    );

    // F19 — the PUBLISHED branch has NO open PR: a visible skip naming the published
    //      branch. The merged hook named the checkout's branch, so the skip pointed at
    //      the wrong branch and the reader could not tell which PR was meant.
    writePrMap([mapMain, mapFork]);
    const noPrForPublished = run(liveEnv, ["origin", "https://github.com/opencharly/opencharly.git"], publishedOther);
    expect(
      noPrForPublished.code === 0 && /no open PR for opencharly\/opencharly head 'other'/.test(noPrForPublished.out),
      `hooks/pre-push FIRED: a push whose PUBLISHED branch has no open PR skips the LIVE-body check visibly, naming the published branch`,
    );
    writePrMap([mapMain, mapOther, mapFork]);
  } catch (err) {
    fail(`firing ${rel} (${err instanceof Error ? err.message : String(err)})`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// ── --self-test: prove each fired assertion goes RED on a mutation ─────────────────
if (argv.includes("--self-test")) {
  if (!existsSync(file)) {
    console.error(`check-pr-body-gate --self-test: ${rel} missing`);
    process.exit(1);
  }
  const original = readFileSync(file, "utf8");
  const tmp = mkdtempSync(join(tmpdir(), "check-pr-body-gate-self-"));
  mkdirSync(join(tmp, "hooks"), { recursive: true });
  // The reconciler travels WITH the hook, so every mutation is fired against the REAL
  // reconciler — a stub would prove nothing about the thing the hook runs.
  mkdirSync(join(tmp, "scripts"), { recursive: true });
  cpSync(join(root, "scripts/check-pr-body-diff.mjs"), join(tmp, "scripts/check-pr-body-diff.mjs"));
  // The reconciler reads the ONE cap from `scripts/lib/pr-body-cap`, beside itself —
  // so the copy of the reconciler travels with the copy of the cap.
  mkdirSync(join(tmp, "scripts/lib"), { recursive: true });
  cpSync(join(root, "scripts/lib/pr-body-cap"), join(tmp, "scripts/lib/pr-body-cap"));
  // `fire()` needs the REAL linter — and the linter imports a sibling module, so the whole
  // scripts directory travels with it. When the submodule is absent this root carries no
  // marketplace at all, the fired assertions skip, and the mutations that depend on them are
  // reported as skipped rather than as failures (the check-harness-config.mjs precedent: a
  // surface not materialized in THIS checkout is skipped with a NOTICE, and the report names
  // how many arms were live instead of aborting on an ENOENT).
  const lintPresent = existsSync(join(root, "marketplace/scripts/pr_body_lint.py"));
  if (lintPresent) {
    mkdirSync(join(tmp, "marketplace"), { recursive: true });
    cpSync(join(root, "marketplace/scripts"), join(tmp, "marketplace/scripts"), { recursive: true });
  }
  const runGate = () => {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", tmp], { encoding: "utf8" });
    return r.status;
  };
  const mutations = [
    // The arms that need the ORG LINTER are marked so; every other arm runs in a
    // checkout without the marketplace submodule, because the LIVE-body check and the
    // reconciler both run BEFORE the linter. The flag used to mark the three live-body
    // mutations as linter-free while `fire()` skipped EVERY arm without the linter, so
    // in a light checkout the gate reported mutations it could not catch as failures.
    [
      "missing body fails closed",
      (s) =>
        s.replace(
          /if \[ ! -e "\$BODY" \]; then\n  echo "pre-push: \[pre-push-skip\] no PR body at \$BODY[^\n]*\n/,
          'if [ ! -e "$BODY" ]; then\n  echo "nope"; exit 1\n  echo "pre-push: [pre-push-skip] no PR body at $BODY"\n',
        ),
      "no body SKIPS visibly",
      false,
    ],
    [
      "missing linter fails closed",
      (s) =>
        s.replace(
          /if \[ ! -f "\$LINT" \]; then\n  echo "pre-push: \[pre-push-skip\] \$LINT is absent[^\n]*\n/,
          'if [ ! -f "$LINT" ]; then\n  echo "nope"; exit 1\n  echo "pre-push: [pre-push-skip] $LINT is absent"\n',
        ),
      "missing linter SKIPS visibly",
      false,
    ],
    [
      "a lint finding does not block the push",
      (s) => s.replace(/if python3 "\$LINT" "\$BODY" --repo "\$ROOT"; then/, 'if true; then'),
      "defective body is BLOCKED",
    ],
    [
      "a linter that cannot run blocks the push",
      (s) => s.replace(/if ! python3 "\$LINT" --help >\/dev\/null 2>&1; then/, "if false; then"),
      "linter that cannot run SKIPS visibly",
    ],
    [
      "the body path defaults into the tracked tree",
      (s) => s.replace(/BODY="\$\{PR_BODY_FILE:-\$GITDIR\/PR_BODY\.md\}"/, 'BODY="${PR_BODY_FILE:-$ROOT/PR_BODY.md}"'),
      "found at the git-dir default",
    ],
    [
      "the body/diff reconciliation does not run",
      (s) => s.replace(/if node "\$RECONCILE" --body "\$BODY" --repo "\$ROOT"; then/, "if true; then"),
      "a body that does not describe the diff is BLOCKED",
      false,
    ],
    // The LIVE-body arms do NOT need the marketplace linter: the live-body check runs
    // BEFORE it, so these mutations are live in a checkout without the submodule.
    [
      "the live-body check does not run",
      (s) => s.replace(/if ! live_body_check "\$@"; then/, "if false; then"),
      "a live body that does not match is BLOCKED",
      false,
    ],
    [
      "a stale live body does not block the push",
      (s) => s.replace(/if \[ "\$local_body" = "\$live" \]; then/, "if true; then"),
      "a live body that does not match is BLOCKED",
      false,
    ],
    [
      "the live-body check fails closed when gh is absent",
      (s) =>
        s.replace(
          /if ! command -v gh >\/dev\/null 2>&1; then\n(\s*)echo "pre-push: \[live-body-skip\] gh is not installed/,
          'if ! command -v gh >/dev/null 2>&1; then\n$1echo "nope"; exit 1\n$1echo "pre-push: [live-body-skip] gh is not installed',
        ),
      "without gh the LIVE-body check SKIPS visibly",
      false,
    ],
    // The two mutations that reproduce the defects opencharly/opencharly#742 shipped
    // with, exactly: the published branch read from a third argument git never sets,
    // and the pushed remote read from a function that was called with no arguments.
    [
      "the published branch is not read from the refs git publishes",
      (s) =>
        s.replace(
          /branch="\$published"/,
          () => 'branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"',
        ),
      "a push that publishes a branch other than the checked-out one is checked against THAT branch's PR",
      false,
    ],
    [
      "the pushed remote is not the one the push names",
      (s) => s.replace(/if ! live_body_check "\$@"; then/, "if ! live_body_check; then"),
      "a push to a remote other than origin is checked against THAT remote's PR",
      false,
    ],
  ];
  let stFails = 0;
  let stLive = 0;
  let stSkipped = 0;
  for (const [name, mutate, expect, needsLinter = true] of mutations) {
    if (needsLinter && !lintPresent) {
      // Every mutation here targets a FIRED assertion, and with no linter to fire there is
      // nothing to judge. Skipped VISIBLY: never counted as caught, never a silent pass.
      stSkipped += 1;
      console.log(`  SKIP  mutation '${name}': the marketplace submodule is not materialized, so the fired assertion it targets cannot run`);
      continue;
    }
    const mutated = mutate(original);
    if (mutated === original) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did not apply (the source it targets moved)`);
      continue;
    }
    writeFileSync(join(tmp, rel), mutated, "utf8");
    chmodSync(join(tmp, rel), 0o755);
    stLive += 1;
    if (runGate() === 0) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did NOT go red (expected a '${expect}' finding)`);
    } else {
      console.log(`  PASS  mutation '${name}' is caught (gate red)`);
    }
  }
  writeFileSync(join(tmp, rel), original, "utf8");
  chmodSync(join(tmp, rel), 0o755);
  if (runGate() !== 0) {
    stFails += 1;
    console.error("  FAIL  the unmutated copy is not green");
  } else {
    console.log("  PASS  the unmutated copy is GREEN");
  }
  rmSync(tmp, { recursive: true, force: true });
  if (stFails) {
    console.error(`check-pr-body-gate --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log(
    `check-pr-body-gate --self-test: OK (${stLive}/${mutations.length} arms live` +
      `${stSkipped ? `; ${stSkipped} skipped — the marketplace submodule is not materialized in this checkout` : ""})`,
  );
  process.exit(0);
}

await check();
await fire();
if (failures) {
  console.error(`check-pr-body-gate: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-pr-body-gate: OK");
