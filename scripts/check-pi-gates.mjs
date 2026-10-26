#!/usr/bin/env node
// check-pi-gates.mjs — regression gate for the committed pi gate extension
// (`.pi/extensions/charly-gates.ts`), mirroring check-opencode-plugin.mjs and
// check-pr-watch.mjs: static assertions over the SHIPPED code (comments stripped),
// each proven to FAIL by a mutation.
//
// Why it exists (T3/R3/R10): the pi extension is the harness's git-workflow gate
// wiring — it intercepts every `tool_call` and blocks commands the gate scripts
// reject. `check-harness-config.mjs` only asserts the surfaces PARSE and are wired;
// it does NOT catch a broken gate, so without this file the extension's behaviour is
// unproven. Five properties this gate pins, each a real defect class:
//
//   1. FAIL-CLOSED — a gate whose script ERRORS or is ABSENT must BLOCK, never
//      `continue`. A fail-open wiring is a bypass path (the gate silently does not run).
//   2. RULE-2 PATHS — the worktree tool must use `<umbrella>/.worktrees/<slug>/`,
//      not `.claude/worktrees/`, and name the binary `charly/bin/charly`.
//   3. REGISTERED — the `tool_call` hook and both gate scripts are present.
//   4. SOUL INJECTION (#359) — the identity itself is READ from the project-root SOUL.md
//      and re-injected every turn, never a pointer to it.
//   5. WORKTREE COST MODEL — `charly_worktree_create` materializes a SCOPED module set and
//      BORROWS the main checkout's objects (`--reference`), instead of cloning the whole
//      submodule graph into a worktree-private object store. MEASURED (2026-10-06, umbrella
//      tree `9501fb0`): the eager `--init --recursive` cost 376 MB of private objects per
//      worktree at ~0.86 s per module; the scoped `--reference` form costs 1 MB and ~1.4 s,
//      and every commit-time gate passes with the rest of the graph left unmaterialized.
//   6. WORKTREE REMOVAL IS HONEST — asserted BELOW by LOADING the shipped extension and
//      FIRING `charly_worktree_remove` against real repositories, not by matching its text
//      (opencharly/opencharly#410). `pi.exec` RESOLVES on a non-zero exit (pi 1.0.4:
//      `exec → execCommand` resolves in every branch), so the shipped `catch`-gated `--force`
//      retry was unreachable dead code and a REFUSED removal printed success. A regex gate
//      cannot see that — only firing can.
//   7. THE NESTED POST-CONDITION — a MATERIALIZED module carries its OWN nested level
//      (opencharly/opencharly#710), delegated to the umbrella's own initializer and
//      fail-closed. Without it the ABSENT nested level is INVISIBLE to the currency
//      report — it judges a twin's CURRENCY from the twin's REMOTE alone and never asks
//      whether the checkout EXISTS, so while that remote has not moved the twin reads
//      `cur` and the report exits 0; the checkout is needed only to CLASSIFY a twin
//      whose remote HAS moved. Asserted TWICE: by the shipped TEXT (the call shape, the
//      `--root`/`--all` re-rooting, the fail-closed read of the exit code) and by FIRING
//      `charly_worktree_create` against a fixture umbrella whose `charly` module DECLARES a
//      nested submodule (F6: the nested level really materializes) and against one whose
//      nested submodule cannot be cloned (F7: the tool FAILS, never reports a ready
//      worktree). A text assertion cannot see either: the call shape is text, the EFFECT
//      is a materialized tree.
//
// Usage: node scripts/check-pi-gates.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTypeScript } from "./lib/ts-syntax.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const rel = ".pi/extensions/charly-gates.ts";
const file = join(root, rel);

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);

/** Strip line/block comments and string literals so the assertions read CODE, not commentary. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n");
}

/**
 * git's environment-config channel. The FIXTURE's remotes are local paths, and git refuses
 * a submodule clone over the `file` transport unless it is allowed. The allowance is set in
 * the PROCESS environment, so the extension's own commands inherit it exactly as a session's
 * would — the real `pi.exec` inherits the environment too. The org's real remotes are
 * https, so this is a property of the FIXTURE, never of the shipped code.
 *
 * The entries are APPENDED at the first free slot: an environment that already carries
 * `GIT_CONFIG_COUNT` keeps its own entries, and git reads the highest priority last.
 */
function allowFileTransportInEnv() {
  const count = Number(process.env.GIT_CONFIG_COUNT ?? "0") || 0;
  const entries = [
    ["protocol.file.allow", "always"],
    ["init.defaultBranch", "main"],
  ];
  entries.forEach(([key, value], i) => {
    process.env[`GIT_CONFIG_KEY_${count + i}`] = key;
    process.env[`GIT_CONFIG_VALUE_${count + i}`] = value;
  });
  process.env.GIT_CONFIG_COUNT = String(count + entries.length);
}

/**
 * A fixture umbrella for the FIRED create cases: an "origin" that carries the REAL
 * `scripts/init-submodules.sh`, a `charly` module that DECLARES a nested submodule
 * (`box/cachyos`) and a `marketplace` module that declares none.
 *
 * `nestedBroken` points the nested submodule's URL at a remote that cannot be cloned —
 * the fail-closed arm (F7). The nested twin carries ONE file, so a materialized nested
 * level is observably NOT empty: a cloned-but-empty path reads as at-the-pin, which is
 * exactly the defect class this post-condition exists to end.
 */
function buildUmbrellaFixture(base, { nestedBroken = false, scriptPath } = {}) {
  const git = (cwd, ...a) => {
    const r = spawnSync("git", a, { cwd, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${a.join(" ")} in ${cwd} failed: ${(r.stderr || "").trim()}`);
    return r.stdout;
  };
  const seed = (name) => {
    const dir = join(base, name);
    mkdirSync(dir, { recursive: true });
    git(dir, "init", "-q", "-b", "main");
    git(dir, "config", "user.email", "gate@gate");
    git(dir, "config", "user.name", "gate");
    // The local transport can serve a partial clone when the serving side allows it, so the
    // fixture's own clones carry no "filtering not recognized" warning.
    git(dir, "config", "uploadpack.allowFilter", "true");
    return dir;
  };
  const commit = (dir, msg) => {
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", msg);
  };

  const box = seed("box");
  writeFileSync(join(box, "marker.txt"), "the nested twin\n");
  commit(box, "the nested twin");

  const charly = seed("charly");
  mkdirSync(join(charly, "scripts"), { recursive: true });
  writeFileSync(join(charly, "scripts", "bootstrap-charly.sh"), "#!/usr/bin/env bash\nexit 0\n");
  git(charly, "submodule", "add", "-q", box, "box/cachyos");
  if (nestedBroken) {
    const gm = readFileSync(join(charly, ".gitmodules"), "utf8");
    writeFileSync(join(charly, ".gitmodules"), gm.split(box).join(join(base, "no-such-remote")));
  }
  commit(charly, "the charly module");

  const marketplace = seed("marketplace");
  writeFileSync(join(marketplace, "corpus.md"), "the corpus\n");
  commit(marketplace, "the marketplace module");

  const origin = seed("origin");
  mkdirSync(join(origin, "scripts"), { recursive: true });
  cpSync(scriptPath, join(origin, "scripts", "init-submodules.sh"));
  git(origin, "submodule", "add", "-q", charly, "charly");
  git(origin, "submodule", "add", "-q", marketplace, "marketplace");
  commit(origin, "the umbrella");

  const umbrella = join(base, "umbrella");
  const clone = spawnSync("git", ["clone", "-q", origin, umbrella], { encoding: "utf8" });
  if (clone.status !== 0) throw new Error(`cloning the fixture origin failed: ${(clone.stderr || "").trim()}`);
  return { umbrella };
}

function check() {
  if (!existsSync(file)) {
    fail(`${rel} exists`);
    return;
  }
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);

  // 0. PARSE. A regex gate cannot see an unparseable extension (R1: an unescaped backtick
  //    in the injected rules block stayed green here and only broke when pi loaded it).
  const parseErr = parseTypeScript(raw);
  if (parseErr) fail(`${rel} parses as TypeScript (${parseErr})`);

  // 1. fail-closed: the gate-script exec `catch` MUST block, never continue.
  if (/fail[- ]open/i.test(code)) fail(`does not fail OPEN on an unexpected gate error`);
  if (!/could not run — failing closed/.test(raw))
    fail(`fails CLOSED on an unexpected gate error (the exec catch must block with the fail-closed reason)`);
  if (!/is absent .*failing closed/.test(raw))
    fail(`fails CLOSED when a gate script is ABSENT (the access() miss must block, never continue)`);
  if (!/block:\s*true/.test(code)) fail(`returns a block on a gate failure`);

  // 2. rule-2 paths
  if (/\.claude["'`,\s]*,\s*["'`]worktrees/.test(code) || /join\([^)]*\.claude[^)]*worktrees/.test(code))
    fail(`uses <umbrella>/.worktrees/<slug>/ (rule 2), not .claude/worktrees`);
  if (!/\.worktrees/.test(code)) fail(`uses <umbrella>/.worktrees/<slug>/ (rule 2)`);
  if (!/charly\/bin\/charly/.test(code)) fail(`names the worktree binary charly/bin/charly`);

  // 3. registered
  if (!/pi\.on\(\s*["'`]tool_call["'`]/.test(code)) fail(`intercepts pi's tool_call event`);
  if (!/pre-commit-gate\.sh/.test(code) || !/pre-push-gate\.sh/.test(code))
    fail(`wires both pre-commit-gate.sh and pre-push-gate.sh`);

  // 4. SOUL injection (#359): the `before_agent_start` handler reads the project-root
  //    SOUL.md and injects the IDENTITY itself (not a pointer to it) every turn.
  if (!/readSoul/.test(code) || !/SOUL\.md/.test(code)) fail(`injects the project-root SOUL.md identity (readSoul)`);
  if (!/pi\.on\(\s*["'`]before_agent_start["'`]/.test(code)) fail(`injects SOUL.md via the before_agent_start handler`);

  // 5. WORKTREE COST MODEL. The tool must materialize a SCOPED module set and borrow the
  //    main checkout's objects. A worktree is the session's isolation boundary for MUTABLE
  //    state (tree, index, branch, binary) — never a place to COPY the immutable submodule
  //    graph. Both halves are asserted: the graph must not be cloned, and the cache must be
  //    requested explicitly (the automatic `submodule.alternateLocation=superproject` does
  //    NOT engage for a linked worktree — 0 alternates files, measured). The flag is
  //    asserted as an ARGUMENT (`"--recursive"`), not as prose: the tool's own description
  //    may legitimately name the flag it no longer passes.
  if (/"--recursive"/.test(code))
    fail(`does not pass --recursive to \`git submodule update --init\` (never clone the whole graph)`);
  if (/\[\s*["'`]submodule["'`]\s*,\s*["'`]update["'`]\s*,\s*["'`]--init["'`]\s*,\s*["'`]--recursive/.test(code))
    fail(`does not run a graph-wide \`submodule update --init --recursive\``);
  if (!/push\(\s*["'`]--reference["'`]/.test(code))
    fail(`borrows module objects from the main checkout (an explicit --reference)`);
  if (!/REQUIRED_WORKTREE_MODULES\s*=\s*\[\s*["'`]charly["'`]\s*,\s*["'`]marketplace["'`]\s*\]/.test(code))
    fail(`names the required module set (charly, marketplace)`);
  // The required set is a FLOOR: step 4 builds the binary from `charly/scripts/
  // bootstrap-charly.sh`, so a cutover that names extra modules must never be able to drop it.
  // Asserted as a UNION (spread of the required set into the Set), not as the mere presence of
  // the name — `const modules = requested` would satisfy a name check and break the build (the
  // trap the live run of this tool exposed).
  if (!/new Set\(\[\s*\.\.\.REQUIRED_WORKTREE_MODULES/.test(code))
    fail(`builds the materialized set as a UNION with the required modules (an extra module must never drop charly)`);
  if (!/modules:\s*Type\.Optional/.test(code)) fail(`exposes a \`modules\` argument for the modules a cutover actually needs`);

  // 7. THE NESTED POST-CONDITION (opencharly/opencharly#710). A MATERIALIZED module must
  //    carry its OWN nested level: the post-condition `charly task init` guarantees
  //    (opencharly/opencharly#647) and the umbrella's gate ASSERTS. Without it the
  //    umbrella's currency report cannot SEE the absence at all: a twin's currency is
  //    judged from the twin's REMOTE alone and the report never asks whether the
  //    checkout EXISTS, so while that remote has not moved the twin reads `cur` and the
  //    report exits 0 — the checkout is needed only to CLASSIFY a twin whose remote HAS
  //    moved, and only then does the report print
  //    `differs (no checkout of box/cachyos to judge ancestry)`.
  //
  //    The extension DELEGATES it to the umbrella's own initializer, re-rooted at the
  //    module — ONE lifecycle implementation at every level (R2), never a hand-rolled
  //    second materializer — and it FAILS CLOSED: `pi.exec` RESOLVES on a non-zero exit
  //    (the #410 lesson), so the exit code is read, never assumed.
  if (!/init-submodules\.sh/.test(code))
    fail(`materializes a module's nested level through the umbrella's OWN initializer (scripts/init-submodules.sh)`);
  if (!/["'`]--root["'`]\s*,\s*moduleRoot/.test(code))
    fail(`re-roots that initializer at the MODULE (--root <module>), so it materializes the module's own nested level`);
  if (!/(["'`]--all["'`])|(["'`]--nested["'`])/.test(code))
    fail(`asks the initializer for the module's OWN declared set (--all at the module's root)`);
  if (!/res\.code !== 0/.test(code))
    fail(`fails CLOSED when the nested level does not materialize (pi.exec RESOLVES on a non-zero exit)`);

  if (failures === 0)
    ok(
      `${rel}: fails closed, rule-2 paths, gate wiring + SOUL injection present, ` +
        `and the worktree materializes a scoped module set from the shared object cache, ` +
        `with each materialized module's own nested level`,
    );
}

// ── Property 6: `charly_worktree_remove` is HONEST — LOADED AND FIRED ────────────────
//
// Assertions 1-5 read the extension's TEXT. That is exactly the blindness #410 lived in: the
// shipped extension read clean while a refused removal printed success, because the defect is
// a CONTRACT fact (`pi.exec` resolves on a non-zero exit) that no pattern can see. So this
// section loads the SHIPPED module and FIRES the tool against real git repositories, and the
// fixture is #410's own evidence: ONE `worktree remove` call while the directory survived.
//
// The load uses a stand-in for the extension's ONLY runtime bare import (`typebox` — its
// schema objects are opaque to the tool's logic) under Node's native TypeScript stripping. The
// `ExtensionAPI` stub's `exec` is the PROVEN REAL contract (pi 1.0.4's `exec` delegates to
// `execCommand`, whose promise RESOLVES `{stdout, stderr, code, killed}` in every branch,
// including its own internal catch) — a stub that REJECTED would certify a contract pi does
// not have and would hide the very defect this section exists for.
async function fire() {
  const scratch = mkdtempSync(join(tmpdir(), "check-pi-gates-fire-"));
  const git = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8" });
  const expect = (cond, msg) => (cond ? ok(msg) : fail(msg));

  try {
    // 1. The fire root: the REAL gate scripts, the REAL extension, the REAL identity.
    const fireRoot = join(scratch, "root");
    mkdirSync(join(fireRoot, ".pi/extensions"), { recursive: true });
    cpSync(join(root, ".claude/hooks"), join(fireRoot, ".claude/hooks"), { recursive: true });
    cpSync(file, join(fireRoot, rel));
    if (existsSync(join(root, "SOUL.md"))) cpSync(join(root, "SOUL.md"), join(fireRoot, "SOUL.md"));
    if (existsSync(join(root, "AGENTS.md"))) cpSync(join(root, "AGENTS.md"), join(fireRoot, "AGENTS.md"));
    mkdirSync(join(fireRoot, "node_modules/typebox"), { recursive: true });
    writeFileSync(
      join(fireRoot, "node_modules/typebox/package.json"),
      JSON.stringify({ name: "typebox", version: "0.0.0-check-pi-gates", type: "module", main: "index.mjs" }),
    );
    writeFileSync(
      join(fireRoot, "node_modules/typebox/index.mjs"),
      `const mk = (kind) => (opts) => ({ kind, opts });
export const Type = { Object: mk("Object"), String: mk("String"), Optional: mk("Optional"), Array: mk("Array") };
export default { Type };
`,
    );

    // 2. Load the shipped module and capture everything it registers/fires on.
    const tools = new Map();
    const handlers = new Map();
    const api = {
      on: (event, handler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return () => {};
      },
      registerTool: (def) => tools.set(def.name, def),
      exec: (command, args, options) =>
        new Promise((resolve) => {
          const p = spawnSync(command, args, { cwd: options?.cwd ?? fireRoot, encoding: "utf8" });
          resolve({ stdout: p.stdout ?? "", stderr: p.stderr ?? "", code: p.status ?? 1, killed: false });
        }),
    };
    (await import(join(fireRoot, rel))).default(api);
    const remove = tools.get("charly_worktree_remove");
    if (!remove) {
      fail(`${rel} registers charly_worktree_remove (loaded and fired)`);
      return;
    }

    // F0 — the GATE ITSELF, fired with the REAL gate scripts. Assertions 1-3 read the wiring;
    //      this one proves it DECIDES. Two mutations below keep every static assertion green
    //      while the gate silently allows a hook-bypassing commit, so this is not redundant.
    const onToolCall = handlers.get("tool_call")?.[0];
    const blocked = onToolCall
      ? await onToolCall({ toolName: "bash", input: { command: "git commit --no-verify -m x" } }, { cwd: fireRoot })
      : undefined;
    const allowed = onToolCall
      ? await onToolCall({ toolName: "bash", input: { command: "git status --short" } }, { cwd: fireRoot })
      : undefined;
    expect(
      blocked?.block === true && allowed === undefined,
      `${rel} FIRED: the tool_call gate BLOCKS a hook-bypassing commit (real pre-commit-gate.sh) and ALLOWS a benign command`,
    );

    // F0b — SOUL injection, fired: the identity is the project-root SOUL.md itself, re-injected
    //       on every turn, not a pointer to it.
    const onStart = handlers.get("before_agent_start")?.[0];
    const started = onStart ? await onStart({ systemPrompt: "BASE" }, { cwd: fireRoot }) : undefined;
    const soul = existsSync(join(fireRoot, "SOUL.md"))
      ? readFileSync(join(fireRoot, "SOUL.md"), "utf8").trim().slice(0, 60)
      : "";
    expect(
      soul.length > 0 && (started?.systemPrompt ?? "").startsWith("BASE") && (started?.systemPrompt ?? "").includes(soul),
      `${rel} FIRED: before_agent_start re-injects the project-root SOUL.md identity every turn`,
    );

    // F0c — the RULES are read from the project-root AGENTS.md (R2: stated once, never copied
    //       into the extension). Every injected section must be present verbatim, and no
    //       "changed shape" marker may appear — a renamed AGENTS.md heading turns this red.
    const agentsMd = existsSync(join(fireRoot, "AGENTS.md")) ? readFileSync(join(fireRoot, "AGENTS.md"), "utf8") : "";
    const prompt = started?.systemPrompt ?? "";
    const wanted = ["## The ground-truth rules R1–R10", "## Commit, push, land", "## AI Attribution (Fedora Policy Compliant)"];
    expect(
      agentsMd.length > 0 &&
        wanted.every((h) => agentsMd.includes(`\n${h}\n`) && prompt.includes(h)) &&
        prompt.includes("**R1 — RCA every anomaly") &&
        !prompt.includes("the rulebook changed shape"),
      `${rel} FIRED: before_agent_start injects the R1–R10, "Commit, push, land" and attribution sections READ from AGENTS.md`,
    );

    // 3. Fixtures — one real repository per state the tool must tell apart.
    const repo = (name) => {
      const dir = join(scratch, name);
      mkdirSync(dir, { recursive: true });
      git(dir, "init", "-q", "-b", "main");
      git(dir, "config", "user.email", "gate@gate");
      git(dir, "config", "user.name", "gate");
      writeFileSync(join(dir, "f.txt"), "base\n");
      git(dir, "add", "-A");
      git(dir, "commit", "-qm", "base");
      git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
      return dir;
    };
    const worktree = (dir, slug) => {
      mkdirSync(join(dir, ".worktrees"), { recursive: true });
      git(dir, "worktree", "add", "-q", "-b", `feat/${slug}`, join(dir, ".worktrees", slug), "main");
      return join(dir, ".worktrees", slug);
    };
    const commitIn = (wt, body) => {
      writeFileSync(join(wt, "f.txt"), body);
      git(wt, "commit", "-qam", "feature: change");
    };
    const listed = (dir, slug) =>
      git(dir, "worktree", "list", "--porcelain").stdout.includes(`/.worktrees/${slug}`);
    const fireRemove = (dir, slug) => remove.execute("gate", { slug }, undefined, undefined, { cwd: dir });

    // F1 — the ORDINARY refusal: a worktree holding an untracked file. The `--force` retry must
    //      be REACHABLE and the removal must really happen (today's code prints success while
    //      the directory survives — the exec log shows one call and no escalation).
    const d1 = repo("dirty");
    const w1 = worktree(d1, "dirty");
    writeFileSync(join(w1, "untracked.txt"), "debris\n");
    const r1 = await fireRemove(d1, "dirty");
    expect(
      !existsSync(w1) && !listed(d1, "dirty") && r1.details?.removed === true,
      `charly_worktree_remove FIRED: the --force escalation is reachable — a dirty worktree is really gone`,
    );

    // F2 — a removal that is genuinely IMPOSSIBLE: a LOCKED worktree needs `-f -f`, which no
    //      single `--force` supplies. The tool must say so and FAIL, never print success.
    const d2 = repo("locked");
    const w2 = worktree(d2, "locked");
    git(d2, "worktree", "lock", w2);
    const r2 = await fireRemove(d2, "locked");
    expect(
      existsSync(w2) && r2.isError === true && r2.details?.removed === false,
      `charly_worktree_remove FIRED: a refused removal FAILS and reports removed=false, never success`,
    );

    // F3 — the branch arm. After a SQUASH merge the branch head is NOT an ancestor of
    //      origin/main, so the retired `git branch --merged` never fired and every landed
    //      feat/ branch leaked. The patch-id proof must delete it.
    const d3 = repo("squashed");
    commitIn(worktree(d3, "squashed"), "base\nchange\n");
    git(d3, "merge", "--squash", "feat/squashed");
    git(d3, "commit", "-qm", "feature: change (#1)");
    git(d3, "update-ref", "refs/remotes/origin/main", "HEAD");
    const r3 = await fireRemove(d3, "squashed");
    expect(
      git(d3, "rev-parse", "--verify", "--quiet", "refs/heads/feat/squashed").status !== 0 &&
        r3.details?.branchState === "deleted",
      `charly_worktree_remove FIRED: a SQUASH-merged branch is deleted (patch-id containment, not ancestry)`,
    );

    // F4 — the other polarity: a branch whose work is NOT in origin/main must be KEPT, and the
    //      report must SAY so rather than claim it was removed (the false claim #410's fix
    //      must not reintroduce).
    const d4 = repo("unmerged");
    commitIn(worktree(d4, "unmerged"), "base\nunlanded\n");
    const r4 = await fireRemove(d4, "unmerged");
    expect(
      git(d4, "rev-parse", "--verify", "--quiet", "refs/heads/feat/unmerged").status === 0 &&
        r4.details?.branchState === "kept" &&
        r4.details?.removed === true &&
        r4.isError !== true &&
        /KEPT/.test(r4.content?.[0]?.text ?? "") &&
        !/deleted/.test(r4.content?.[0]?.text ?? ""),
      `charly_worktree_remove FIRED: an UNMERGED branch survives and the report says KEPT, not deleted`,
    );

    // F5 — the effect is REPORTED, not assumed. MEASURED: `--force` over a non-writable
    //      subdirectory exits non-zero having already DROPPED the administrative entry while
    //      the directory survives — the two halves of "gone" disagree, and the report must
    //      carry what was OBSERVED.
    const d5 = repo("readonly");
    const w5 = worktree(d5, "readonly");
    const ro = join(w5, "sub");
    mkdirSync(ro, { recursive: true });
    writeFileSync(join(ro, "g.txt"), "x\n");
    chmodSync(ro, 0o500);
    const r5 = await fireRemove(d5, "readonly");
    chmodSync(ro, 0o700);
    expect(
      existsSync(w5) && r5.isError === true && r5.details?.removed === false,
      `charly_worktree_remove FIRED: reports the OBSERVED effect (a surviving directory is removed=false)`,
    );

    // ── F6/F7 — the NESTED POST-CONDITION, FIRED ─────────────────────────────────────
    // The create tool is fired against a FIXTURE umbrella: an origin that carries the REAL
    // `scripts/init-submodules.sh`, a `charly` module that DECLARES a nested submodule and
    // a `marketplace` module that declares none. Static assertion 7 reads the TEXT of step
    // 3b; these two fire the tool, because the post-condition is an EFFECT — a materialized
    // nested level in the worktree — and an EFFECT is not in the text.
    allowFileTransportInEnv();
    const create = tools.get("charly_worktree_create");
    if (!create) {
      fail(`${rel} registers charly_worktree_create (loaded and fired)`);
      return;
    }
    const scriptPath = join(root, "scripts", "init-submodules.sh");
    const fireCreate = async (base, opts) => {
      const fx = buildUmbrellaFixture(base, { ...opts, scriptPath });
      const res = await create.execute("gate", { slug: opts.slug }, undefined, undefined, { cwd: fx.umbrella });
      return { res, worktree: join(fx.umbrella, ".worktrees", opts.slug) };
    };

    // F6 — the ordinary case: the module materializes AND its OWN nested level materializes
    //      with it, at the gitlink the module's tree records.
    const good = await fireCreate(join(scratch, "fx-nested"), { slug: "fired-nested" });
    expect(
      good.res.details?.error === undefined &&
        existsSync(join(good.worktree, "charly", "box", "cachyos", "marker.txt")) &&
        /Nested levels materialized: charly/.test(good.res.content?.[0]?.text ?? ""),
      `charly_worktree_create FIRED: a materialized module carries its OWN nested level (the #710 post-condition, materialized by the umbrella's initializer)`,
    );

    // F7 — the fail-closed arm: the nested level cannot materialize. `pi.exec` RESOLVES on a
    //      non-zero exit, so the tool must READ the exit code and FAIL — never report a
    //      ready worktree whose nested level is missing.
    const broken = await fireCreate(join(scratch, "fx-broken"), { slug: "fired-broken", nestedBroken: true });
    expect(
      typeof broken.res.details?.error === "string" &&
        /did not materialize/.test(broken.res.details.error) &&
        !existsSync(join(broken.worktree, "charly", "box", "cachyos", "marker.txt")),
      `charly_worktree_create FIRED: a nested level that cannot materialize FAILS the tool (never a ready worktree)`,
    );
  } catch (err) {
    fail(`loading and firing ${rel} (${err instanceof Error ? err.message : String(err)})`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// ── --self-test: prove each assertion goes RED on a mutation ──────────────────
if (argv.includes("--self-test")) {
  if (!existsSync(file)) {
    console.error(`check-pi-gates --self-test: ${rel} missing`);
    process.exit(1);
  }
  const original = readFileSync(file, "utf8");
  const tmp = mkdtempSync(join(tmpdir(), "check-pi-gates-"));
  mkdirSync(join(tmp, ".pi/extensions"), { recursive: true });
  // The fire section LOADS the module against the REAL gate scripts and the REAL identity, so
  // the scratch root carries them too. Without them the load itself would fail and EVERY
  // mutation would look "caught" for the wrong reason — the unmutated-copy check below is what
  // keeps that honest, and it is why these copies are load-bearing rather than tidy.
  if (existsSync(join(root, ".claude/hooks"))) cpSync(join(root, ".claude/hooks"), join(tmp, ".claude/hooks"), { recursive: true });
  if (existsSync(join(root, "SOUL.md"))) cpSync(join(root, "SOUL.md"), join(tmp, "SOUL.md"));
  if (existsSync(join(root, "AGENTS.md"))) cpSync(join(root, "AGENTS.md"), join(tmp, "AGENTS.md"));
  // The FIRED create case materializes the fixture's nested level with the REAL initializer,
  // so the scratch root carries it too: without it every mutation would look "caught" for the
  // wrong reason (the fixture would fail to build), and the unmutated-copy check below is what
  // keeps that honest.
  if (existsSync(join(root, "scripts", "init-submodules.sh"))) {
    mkdirSync(join(tmp, "scripts"), { recursive: true });
    cpSync(join(root, "scripts", "init-submodules.sh"), join(tmp, "scripts", "init-submodules.sh"));
  }
  const runGate = () => {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", tmp], {
      encoding: "utf8",
    });
    return r.status;
  };
  const mutations = [
    ["fail-open", (s) => s.replace(/return\s*\{\s*block:\s*true,\s*reason:\s*`charly gate \(\$\{rel\}\) could not run[\s\S]*?\};/, "continue;"), `failing closed`],
    ["fail-open on absent gate", (s) => s.replace(/is absent at \$\{script\} — failing closed: the gate cannot run/, "XXX"), `when a gate script is ABSENT`],
    ["worktree path", (s) => s.replace(/join\(ctx\.cwd, "\.worktrees", slug\)/, 'join(ctx.cwd, ".claude", "worktrees", slug)'), `.worktrees`],
    ["unparseable", (s) => s + "\nconst broken = ;\n", `parses as TypeScript`],
    ["no gate wiring", (s) => s.replace(/pre-push-gate\.sh/g, "pre-push-gate-XXX.sh"), `pre-push-gate.sh`],
    ["no tool_call", (s) => s.replace(/pi\.on\(\s*"tool_call"/g, 'pi.on("tool_calls"'), `tool_call`],
    ["no SOUL injection", (s) => s.replace(/readSoul/g, "__soul_removed__"), `SOUL.md`],
    [
      "graph-wide submodule init",
      (s) => s.replace(/const args = \["submodule", "update", "--init"\];/, 'const args = ["submodule", "update", "--init", "--recursive"];'),
      `whole submodule graph`,
    ],
    [
      "no object cache",
      (s) => s.replace(/args\.push\("--reference", reference\);/, "void reference;"),
      `--reference`,
    ],
    [
      "required module set emptied",
      (s) => s.replace(/REQUIRED_WORKTREE_MODULES = \["charly", "marketplace"\]/, "REQUIRED_WORKTREE_MODULES = []"),
      `required module set`,
    ],
    [
      "modules can DROP the required set",
      (s) => s.replace(/const modules = \[\.\.\.new Set\(\[\.\.\.REQUIRED_WORKTREE_MODULES, \.\.\.requested\]\)\];/, "const modules = requested;"),
      `UNION with the required modules`,
    ],
    [
      "no modules argument",
      (s) => s.replace(/modules:\s*Type\.Optional\(/, "scopeIgnored: Type.Optional("),
      `modules`,
    ],
    // The nested post-condition (opencharly/opencharly#710): the two ways a worktree can
    // be created WITHOUT the nested level its currency report needs — never initializing
    // it at all, and initializing it without reading the exit code.
    [
      "the nested level is never materialized",
      (s) => s.replace(/"scripts", "init-submodules\.sh"/, '"scripts", "materialize.sh"'),
      `own initializer`,
    ],
    [
      "the nested materialization is not fail-closed",
      (s) => s.replace(/if \(res\.code !== 0\) \{/, "if (false) {"),
      `fails CLOSED when the nested level`,
    ],
    // The three mutations below restore opencharly/opencharly#410 verbatim: the dead
    // `catch`-gated retry, the failure swallowed into a success, and the ancestry test that
    // is blind to a squash merge. Each must be caught by FIRING, not by reading.
    [
      "dead --force escalation (#410)",
      (s) => s.replace(/if \(first\.code !== 0\) \{/, "if (false) {"),
      `--force escalation is reachable`,
    ],
    [
      "a refused removal reported as success (#410)",
      (s) => s.replace(/if \(forced\.code !== 0\) removalFailure = why\(forced\);/, "void forced;"),
      `refused removal FAILS`,
    ],
    [
      "ancestry test for the branch — blind to a squash (#410)",
      (s) => s.replace(/\["cherry", "origin\/main", branch\]/, '["branch", "--merged", "origin/main"]'),
      `SQUASH-merged branch`,
    ],
    [
      "a surviving directory reported as removed (#410)",
      (s) => s.replace(/removed: removedEffect,/g, "removed: true,"),
      `OBSERVED effect`,
    ],
    // These two keep EVERY static assertion green and are caught only by FIRING — which is
    // the whole point of this section (the old gate read the same source and stayed green).
    [
      "gate exit 2 treated as ALLOW (static checks stay green)",
      (s) =>
        s
          .replace(/if \(result\.code === 2\) \{/, "if (false) {")
          .replace(/if \(result\.code !== 0\) \{/, "if (result.code !== 0 && result.code !== 2) {"),
      `BLOCKS a hook-bypassing commit`,
    ],
    [
      "SOUL read but not injected (static checks stay green)",
      (s) =>
        s.replace(
          /systemPrompt: event\.systemPrompt \+ "\\n\\n" \+ soulBlock \+ "\\n" \+ \(await readRulesBlock\(ctx\.cwd\)\),/,
          "systemPrompt: event.systemPrompt,",
        ),
      `re-injects the project-root SOUL.md`,
    ],
    [
      "rules section renamed away from AGENTS.md (static checks stay green)",
      // anchored to the INJECTED_SECTIONS entry line — the doc comment names the same string
      (s) => s.replace(/^  "Commit, push, land",$/m, '  "Commit, push, landing",'),
      `READ from AGENTS.md`,
    ],
    // These two keep EVERY static assertion green and are caught ONLY by FIRING the create
    // tool: the nested post-condition is an EFFECT — a materialized nested level in the
    // worktree — and an EFFECT is not in the text. The first breaks the ROOT the initializer
    // is re-rooted at (the call still names `--root … moduleRoot`, so the text reads right);
    // the second swallows the initializer's non-zero exit while the text still reads
    // `res.code !== 0`.
    [
      "the nested level is materialized at a root that is not the module (static checks stay green)",
      (s) => s.replace(/const moduleRoot = join\(worktreePath, modulePath\);/, 'const moduleRoot = join(worktreePath, "not-a-module");'),
      `carries its OWN nested level`,
    ],
    [
      "the nested failure is swallowed (static checks stay green)",
      (s) => s.replace(/if \(res\.code !== 0\) \{/, "if (res.code !== 0 && false) {"),
      `FAILS the tool`,
    ],
  ];
  let stFails = 0;
  for (const [name, mutate, expect] of mutations) {
    writeFileSync(join(tmp, rel), mutate(original), "utf8");
    const code = runGate();
    if (code === 0) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did NOT go red (expected a '${expect}' finding)`);
    } else {
      console.log(`  PASS  mutation '${name}' is caught (gate red)`);
    }
  }
  writeFileSync(join(tmp, rel), original, "utf8");
  if (runGate() !== 0) {
    stFails += 1;
    console.error("  FAIL  the unmutated copy is not green");
  } else {
    console.log("  PASS  the unmutated copy is GREEN");
  }
  rmSync(tmp, { recursive: true, force: true });
  if (stFails) {
    console.error(`check-pi-gates --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-pi-gates --self-test: OK (every assertion is live)");
  process.exit(0);
}

await check();
await fire();
if (failures) {
  console.error(`check-pi-gates: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-pi-gates: OK");
