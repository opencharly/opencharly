#!/usr/bin/env node
// check-default-branch.mjs — refuse a COMMIT on the repository's default branch (opencharly/charly#842)
//
// The clone-level guards are push-only: `hooks/pre-commit` runs its checks against the
// working tree and never asks which branch `HEAD` is on, so a `git commit` made while
// standing on the default branch is invisible to every gate and is only noticed — if at
// all — at push time, or by the author reading their own `git status`. Measured on the
// umbrella: a command chain ending in a trailing `&` put a `git commit` into a background
// subshell that was killed mid-hook; the re-run committed onto `main`, and no gate saw it.
//
// This is remedy ① from that issue: make the outcome loud at the commit boundary. It is
// deliberately narrower than "never commit on main" — it refuses only when `HEAD` is a
// symbolic ref pointing at the default branch, so a DETACHED head (a rebase, a bisect, a
// read-only checkout) is left alone.
//
// It does NOT replace the remote default-branch audit in `charly task verify`: that one
// reads `git ls-remote` state no commit can change, and answers a different question.
//
//   node scripts/check-default-branch.mjs              # the gate
//   node scripts/check-default-branch.mjs --self-test  # prove the gate can fail
//
// Exit 0 = fine. Exit 1 = refuse the commit, with the reason and the one-line remedy.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REMEDY = "create a branch first: git switch -c feat/<name>";

function gitIn(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

// `origin/HEAD` is the authoritative answer when the clone has it; a clone that has never
// fetched a symref — or a repo with no origin — falls back to the conventional name.
function defaultBranch(cwd) {
  const fromSymref = gitIn(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]); // "origin/main"
  if (fromSymref.startsWith("origin/")) return fromSymref.slice("origin/".length);
  return "main";
}

// A detached HEAD has no branch to refuse — `git symbolic-ref` fails and this returns "".
function judge(cwd) {
  const head = gitIn(cwd, ["symbolic-ref", "--short", "HEAD"]);
  const def = defaultBranch(cwd);
  return { head, def, refuse: Boolean(head) && head === def };
}

if (process.argv.includes("--self-test")) {
  const root = mkdtempSync(join(tmpdir(), "check-default-branch-"));
  let failed = 0;

  const check = (label, want, cwd) => {
    const got = judge(cwd).refuse;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: refuse=${got} want=${want}`);
  };

  try {
    const repo = join(root, "repo");
    execFileSync("git", ["init", "-q", "-b", "main", repo], { stdio: "ignore" });
    execFileSync("git", ["-C", repo, "config", "user.email", "t@example.invalid"], { stdio: "ignore" });
    execFileSync("git", ["-C", repo, "config", "user.name", "t"], { stdio: "ignore" });
    execFileSync("git", ["-C", repo, "commit", "-q", "--allow-empty", "-m", "x"], { stdio: "ignore" });

    // The defect, in one assertion: standing on the default branch must REFUSE.
    check("on the default branch (main)", true, repo);

    // And the remedy must be accepted — a branch off main is the sanctioned place to work.
    execFileSync("git", ["-C", repo, "switch", "-q", "-c", "feat/x"], { stdio: "ignore" });
    check("on a feat/ branch", false, repo);

    // A detached head has no branch to refuse, so the gate must stay silent: a rebase, a
    // bisect and a read-only checkout are all legitimate.
    execFileSync("git", ["-C", repo, "checkout", "-q", "--detach"], { stdio: "ignore" });
    check("on a detached HEAD", false, repo);

    // And the default branch is read from the remote symref, not assumed: a repo whose
    // default is `trunk` must refuse on `trunk`, so a hardcoded "main" cannot pass this.
    const trunk = join(root, "trunk");
    execFileSync("git", ["init", "-q", "-b", "trunk", trunk], { stdio: "ignore" });
    execFileSync("git", ["-C", trunk, "config", "user.email", "t@example.invalid"], { stdio: "ignore" });
    execFileSync("git", ["-C", trunk, "config", "user.name", "t"], { stdio: "ignore" });
    execFileSync("git", ["-C", trunk, "commit", "-q", "--allow-empty", "-m", "x"], { stdio: "ignore" });
    // A real clone sets `origin/HEAD` as a SYMREF (`git remote set-head origin -a` does
    // exactly this) — a direct ref is not what the guard reads, so the fixture must be a
    // symref too, or the case would test a shape that never occurs.
    execFileSync("git", ["-C", trunk, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk"], { stdio: "ignore" });
    check("on a repo whose default branch is trunk", true, trunk);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log(failed === 0 ? "check-default-branch --self-test: OK" : `check-default-branch --self-test: ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

const cwd = process.cwd();
const { head, def, refuse } = judge(cwd);

if (refuse) {
  const top = gitIn(cwd, ["rev-parse", "--show-toplevel"]) || "(unknown)";
  console.error(
    [
      "",
      `check-default-branch: REFUSING the commit — ${top}`,
      "",
      `  HEAD is on the default branch '${head}'.`,
      "",
      "  Every clone-level guard is push-only, so a commit made here would be invisible to",
      "  the gates: it is not reviewed, not validated, and not on a branch anyone can see.",
      "",
      `  ${REMEDY}`,
      "  (then re-run the commit — the change is untouched, still staged)",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

process.exit(0);
