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

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
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
    } else if (/is not checked out/.test(output)) {
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
