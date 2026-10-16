// sync-skill-bindings.selftest.mjs — prove every arm of the binding derivation can FAIL.
//
// A gate that cannot fail proves nothing, so each arm below builds a fixture, applies ONE mutation,
// and asserts that the REAL entry point (a subprocess, so `--check`'s exit code and message are the
// ones under test) goes RED carrying its own reason. The control arm asserts the pristine fixture is
// green, and the idempotence arm asserts that a second write is a no-op — "the generator is idempotent
// or it is wrong".
//
// The fixtures are temp trees, never this checkout: the self-test must be runnable on a tree whose
// submodules are not materialised (a session worktree), where the real corpus is absent.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, "sync-skill-bindings.mjs");

/** A minimal but REAL fixture: two families, three skills (one name repeated across a third family in
 *  the collision arm), a farm with the correct entries, a reasonix list in byte order, opencode. */
function fixture(dir) {
  mkdirSync(join(dir, "marketplace", "alpha", "skills", "one"), { recursive: true });
  mkdirSync(join(dir, "marketplace", "alpha", "skills", "two"), { recursive: true });
  mkdirSync(join(dir, "marketplace", "beta", "skills", "three"), { recursive: true });
  mkdirSync(join(dir, "marketplace", "beta", "agents"), { recursive: true });
  for (const p of [["alpha", "skills", "one"], ["alpha", "skills", "two"], ["beta", "skills", "three"]]) {
    writeFileSync(join(dir, "marketplace", ...p, "SKILL.md"), `---\nname: ${p[2]}\ndescription: |-\n  fixture\n---\n\nbody\n`);
  }
  writeFileSync(join(dir, "marketplace", "beta", "agents", "helper.md"), "---\nname: helper\ndescription: |-\n  fixture\n---\n\nbody\n");
  mkdirSync(join(dir, ".dsh", "skills"), { recursive: true });
  for (const [name, target] of [["one", "alpha"], ["two", "alpha"], ["three", "beta"]]) {
    symlinkSync(`../../marketplace/${target}/skills/${name}`, join(dir, ".dsh", "skills", name));
  }
  writeFileSync(join(dir, "reasonix.toml"), `# fixture\n[other]\nx = 1\n\n[skills]\npaths = [\n    "marketplace/alpha/skills",\n    "marketplace/beta/agents",\n    "marketplace/beta/skills",\n]\n\n[after]\ny = 2\n`);
  writeFileSync(join(dir, "opencode.json"), JSON.stringify({ skills: { paths: ["marketplace"] } }, null, 2) + "\n");
  return dir;
}

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

export function runSelfTest() {
  const base = mkdtempSync(join(tmpdir(), "sync-skill-bindings-"));
  const arms = [];
  const newFixture = (name) => fixture(mkdtempSync(join(base, `${name}-`)));
  const green = (name, args, out) => arm(name, true, run(args), /\bclean\b|done/, out);
  const red = (name, args, want) => arm(name, false, run(args), want);

  const results = [];
  function arm(name, expectGreen, r, want, note) {
    const output = `${r.stdout}${r.stderr}`;
    const ok = expectGreen ? r.status === 0 && want.test(output) : r.status === 1 && want.test(output);
    results.push({ name, ok, status: r.status, first: output.split("\n").find((l) => want.test(l)) ?? output.split("\n")[0], note });
  }

  // ---- control: the pristine fixture is a fixed point -------------------------
  {
    const d = newFixture("control");
    green("control: a correct tree is clean", ["--root", d, "--check"], "the pristine fixture");
  }

  // ---- the farm --------------------------------------------------------------
  {
    const d = newFixture("farm-missing");
    unlinkSync(join(d, ".dsh", "skills", "two"));
    red("farm: a missing entry is stale", ["--root", d, "--check"], /\.dsh\/skills.*STALE/);
  }
  {
    const d = newFixture("farm-extra");
    symlinkSync("../../marketplace/alpha/skills/one", join(d, ".dsh", "skills", "zzz-stale"));
    red("farm: an entry the corpus does not carry is stale", ["--root", d, "--check"], /\.dsh\/skills.*STALE/);
  }
  {
    const d = newFixture("farm-retarget");
    unlinkSync(join(d, ".dsh", "skills", "three"));
    symlinkSync("../../marketplace/alpha/skills/one", join(d, ".dsh", "skills", "three"));
    red("farm: a wrong symlink target is stale", ["--root", d, "--check"], /\.dsh\/skills.*STALE/);
  }
  {
    const d = newFixture("farm-nonsymlink");
    unlinkSync(join(d, ".dsh", "skills", "one"));
    writeFileSync(join(d, ".dsh", "skills", "one"), "not a symlink\n");
    red("farm: a non-symlink entry is stale, not silently shadowed", ["--root", d, "--check"], /\.dsh\/skills.*STALE/);
  }
  {
    const d = newFixture("farm-collision");
    mkdirSync(join(d, "marketplace", "gamma", "skills", "one"), { recursive: true });
    writeFileSync(join(d, "marketplace", "gamma", "skills", "one", "SKILL.md"), "---\nname: one\n---\n\nx\n");
    red("corpus: a name collision across families is a HARD failure", ["--root", d, "--check"], /collisions/);
  }

  // ---- the reasonix list -----------------------------------------------------
  {
    const d = newFixture("reasonix-order");
    const f = join(d, "reasonix.toml");
    writeFileSync(f, readFileSync(f, "utf8").replace(
      `    "marketplace/beta/agents",\n    "marketplace/beta/skills",\n`,
      `    "marketplace/beta/skills",\n    "marketplace/beta/agents",\n`));
    red("reasonix: an out-of-byte-order list is stale (the one-pair drift it had)", ["--root", d, "--check"], /reasonix\.toml.*STALE.*order only/);
  }
  {
    const d = newFixture("reasonix-missing");
    const f = join(d, "reasonix.toml");
    writeFileSync(f, readFileSync(f, "utf8").replace(`    "marketplace/beta/skills",\n`, ""));
    red("reasonix: a missing family directory is stale", ["--root", d, "--check"], /reasonix\.toml.*STALE/);
  }
  {
    const d = newFixture("reasonix-bare");
    const f = join(d, "reasonix.toml");
    writeFileSync(f, readFileSync(f, "utf8").replace(/paths = \[[\s\S]*?\n\]/, `paths = [\n    "marketplace",\n]`));
    red("reasonix: the bare corpus root is stale (it scans prose as skills)", ["--root", d, "--check"], /reasonix\.toml.*STALE/);
  }
  {
    const d = newFixture("reasonix-comment");
    const f = join(d, "reasonix.toml");
    writeFileSync(f, readFileSync(f, "utf8").replace(`paths = [`, "paths = [  # keep me"));
    red("reasonix: a comment inside the array is refused, not dropped", ["--root", d, "--check"], /refusing to rewrite/);
  }

  // ---- the single-root reference --------------------------------------------
  {
    const d = newFixture("opencode-absent");
    writeFileSync(join(d, "opencode.json"), JSON.stringify({ skills: { paths: ["elsewhere"] } }, null, 2) + "\n");
    red("opencode: a paths list that does not name the corpus root fails", ["--root", d, "--check"], /must name the corpus root/);
  }

  // ---- the corpus-absent case: a clean, VISIBLE SKIP, never a crash ----------
  // The verdict here moved from FAIL (exit 1) to SKIP (exit 0) when the guard learned the difference
  // between a missing corpus and an empty one: the harness-config gate SKIPS on a tree without the
  // corpus (Part II rule 2) and turns RED on a tree whose corpus reads as zero, so a writer that
  // failed where the gate skips would put the two arms back into disagreement — which is the defect
  // (opencharly/opencharly#508), not a detail of it. The anti-crash property asserted here is unchanged.
  {
    const d = mkdtempSync(join(base, "nocorpus-"));
    mkdirSync(join(d, ".git"), { recursive: true });
    writeFileSync(join(d, "reasonix.toml"), "# no corpus here\n[skills]\npaths = []\n");
    writeFileSync(join(d, "opencode.json"), JSON.stringify({ skills: { paths: ["marketplace"] } }) + "\n");
    for (const scope of ["reasonix", "farm"]) {
      const r = run(["--check", "--only", scope, "--root", d]);
      const out = `${r.stdout}${r.stderr}`;
      const clean = r.status === 0 && /carries no (skills|families)/.test(out) && !/ENOENT/.test(out) && !/node:fs/.test(out);
      results.push({
        name: `corpus absent: --only ${scope} SKIPS VISIBLY rather than crashing, and agrees with the gate`,
        ok: clean,
        status: r.status,
        first: out.split("\n").find((l) => l.trim()) ?? "(no output)",
        note: "one guard for both arms, so they cannot diverge again",
      });
    }
  }

  // ---- the corpus PRESENT but EMPTY: the case this defect shipped through -----
  // `git worktree add` creates the submodule MOUNT POINT, so every session worktree (Part II rule 2)
  // has `marketplace/` present and EMPTY — and before this arm existed that was indistinguishable
  // from a corpus, so the writer derived ZERO skills and published it: 353 farm entries deleted,
  // `reasonix.toml` rewritten to 0 entries, `exit=0 done`. This arm is the one that fails without the
  // guard: existence is not materialisation.
  {
    const d = newFixture("corpus-empty");
    const farmBefore = readdirSync(join(d, ".dsh", "skills")).sort().join(",");
    const reasonixBefore = readFileSync(join(d, "reasonix.toml"), "utf8");
    rmSync(join(d, "marketplace"), { recursive: true, force: true });
    mkdirSync(join(d, "marketplace"), { recursive: true });
    const w = run(["--root", d]);
    const c = run(["--root", d, "--check"]);
    const farmAfter = readdirSync(join(d, ".dsh", "skills")).sort().join(",");
    const reasonixAfter = readFileSync(join(d, "reasonix.toml"), "utf8");
    const skipped = w.status === 0 && /carries no families/.test(`${w.stdout}${w.stderr}`);
    const checkSkipped = c.status === 0 && /carries no (skills|families)/.test(`${c.stdout}${c.stderr}`);
    const intact = farmBefore === farmAfter && reasonixBefore === reasonixAfter;
    results.push({
      name: "corpus present but EMPTY: the writer SKIPS visibly and writes NOTHING, and --check agrees",
      ok: skipped && checkSkipped && intact,
      status: w.status,
      first: skipped ? "SKIP: marketplace/ is not materialised" : `the writer did not skip (rc=${w.status})`,
      note: `--check rc=${c.status}; farm+reasonix byte-identical: ${intact}`,
    });
  }

  // ---- family directories WITHOUT skill files: the farm half has no input ----
  // This is the shape a checkout takes when the corpus's family directories are present and its skill
  // FILES are not — a partial fixture, or a tree whose corpus was never populated. The two derivations
  // ask the same question about different inputs, so they must answer differently here: `reasonix.toml`
  // enumerates family DIRECTORIES and still has something to list, while the flat farm has zero skills
  // and must SKIP — because a farm derivation with no input would otherwise declare all 353 entries
  // stale, or delete them.
  {
    const d = newFixture("families-no-skills");
    const farmBefore = readdirSync(join(d, ".dsh", "skills")).sort().join(",");
    for (const fam of readdirSync(join(d, "marketplace"))) {
      const sk = join(d, "marketplace", fam, "skills");
      if (!existsSync(sk)) continue;
      for (const name of readdirSync(sk)) rmSync(join(sk, name, "SKILL.md"), { force: true });
    }
    const w = run(["--root", d]);
    const out = `${w.stdout}${w.stderr}`;
    const farmAfter = readdirSync(join(d, ".dsh", "skills")).sort().join(",");
    const farmSkipped = /carries no skills/.test(out);
    const reasonixRan = /reasonix\.toml \[skills\] paths  unchanged/.test(out);
    const intact = farmBefore === farmAfter;
    results.push({
      name: "family dirs but NO skill files: the farm half SKIPS and deletes nothing, the reasonix half still derives",
      ok: w.status === 0 && farmSkipped && reasonixRan && intact,
      status: w.status,
      first: farmSkipped ? "SKIP: marketplace/ carries no skills" : `no skip seen (rc=${w.status})`,
      note: `reasonix still derived: ${reasonixRan}; farm byte-identical: ${intact}`,
    });
  }

  // ---- idempotence: the write mode is a fixed point --------------------------
  {
    const d = newFixture("idempotent");
    const first = run(["--root", d]);
    const second = run(["--root", d]);
    const third = run(["--root", d, "--check"]);
    const ok = first.status === 0 && second.status === 0 && third.status === 0
      && /unchanged \(3 entries\)/.test(second.stdout)
      && /reasonix\.toml \[skills\] paths  unchanged/.test(second.stdout);
    results.push({
      name: "idempotence: a write run twice changes nothing the second time",
      ok,
      status: second.status,
      first: second.stdout.split("\n").find((l) => /unchanged/.test(l)) ?? "(no line)",
      note: `check-after-write rc=${third.status}`,
    });
  }

  // ---- the real corpus, when it is materialised ------------------------------
  {
    const r = run(["--check"]);
    const output = `${r.stdout}${r.stderr}`;
    if (r.status === 0 && /clean/.test(output)) {
      results.push({ name: "this checkout: the derivation is already a fixed point", ok: true, status: 0, first: "sync-skill-bindings: clean", note: "the real corpus" });
    } else if (/carries no (skills|families)/.test(output)) {
      results.push({ name: "this checkout: SKIPPED — marketplace/ is not materialised", ok: true, status: r.status, first: "NOTICE skipped", note: "the same precondition the gate guards" });
    } else {
      results.push({ name: "this checkout: the derivation is already a fixed point", ok: false, status: r.status, first: output.split("\n")[0], note: "run without --check to fix" });
    }
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  (rc=${r.status})  ${r.note ?? ""}`);
    if (!r.ok) console.log(`      saw: ${r.first}`);
  }
  console.log(`sync-skill-bindings --self-test: ${results.length - failed.length}/${results.length} arms live and correct`);
  if (failed.length) console.log(`FAIL: ${failed.length} arm(s) did not discriminate`);
  if (existsSync(base)) rmSync(base, { recursive: true, force: true });
  return failed.length === 0;
}
