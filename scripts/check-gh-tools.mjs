#!/usr/bin/env node
// check-gh-tools.mjs — the gate of the ONE GitHub watcher and coordination toolset
// (`scripts/gh/`, opencharly/opencharly#1140) that every harness uses.
//
// What it proves, each against the SHIPPED code:
//   A. THE CONTRACT, as pure functions of `scripts/gh/lib/`: the item grammar, the event
//      set, the refused poll floor, the verdict classifier (PASS / BLOCK / INCONCLUSIVE /
//      PENDING), what makes a verdict NEW, the wake lines, the verb grammar, the footer
//      and the identity rules.
//   B. THE CLI, end to end, as a real child process against a real local HTTP server that
//      plays GitHub's GraphQL and REST APIs (`GITHUB_API_URL`):
//        * a BLOCK already on the head wakes at arm, and `--no-arm-wake` suppresses it;
//        * a REST RE-RUN — a NEW check run on the same head — fires VERDICT, whether it
//          BLOCKs again or PASSes (the defect of opencharly/marketplace#628);
//        * a run that completes after arm fires; a run that is only in flight does not;
//        * a PR that conflicts with its base (no validator run can exist) wakes CONFLICT;
//        * MERGED at arm, TIMEOUT (4), a sub-floor interval (5), a rate limit (7), a failed
//          initial poll (8), and a second watch of the same items TAKING OVER the first
//          (the first exits 143);
//        * `status`, `footer`, `comment --dry-run`, a real `comment` POST, and `issue`
//          (both axes + the remedy are mandatory; the four form fields and the footer are
//          emitted; an API label rejection surfaces as exit 5).
//   C. THE OPENCODE BINDING: `coord_footer`, `coord_comment` (dry run and POST) and
//      `coord_watch` run in-process against the same server.
//   D. THE FOOTER IS THE LINTER'S SHAPE: the CLI's session line matches
//      `marketplace/scripts/pr_body_lint.py`'s SESSION_LINE (skipped visibly when the
//      marketplace checkout is absent).
//   E. LIVE (LIVE_OPENCODE=1): the REAL `opencode` binary loads the binding with its shared
//      lib from a throwaway project that has no marketplace checkout, against REAL GitHub:
//      `coord_watch` returns MERGED for a real PR that merged long ago (read-only), and
//      `coord_comment` builds a real coordination comment as a DRY RUN — a gate never posts a
//      real comment, and a dry run is a real call that does not write, not a fake. GitHub is
//      never stood in for (R8, opencharly/opencharly#1170). Skipped visibly when unset or
//      without a GitHub credential.
//
// Usage: node scripts/check-gh-tools.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LIVE_MERGED_LINE, LIVE_MERGED_PR, hasGithubCredential, judgeLiveCall } from "./lib/live-github.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);
const expect = (cond, m) => (cond ? ok(m) : fail(m));
const eq = (got, want, m) =>
  got === want ? ok(m) : fail(`${m} (want ${JSON.stringify(want)} got ${JSON.stringify(got)})`);

// ── --self-test: stage the toolset, mutate one rule at a time, the gate must go RED ─────
if (argv.includes("--self-test")) {
  const files = [
    "scripts/gh/cli.ts",
    "scripts/gh/package.json",
    "scripts/gh/lib/github.ts",
    "scripts/gh/lib/watch.ts",
    "scripts/gh/lib/coord.ts",
    "scripts/gh/lib/lock.ts",
    ".opencode/plugins/coord.ts",
    ".opencode/package.json",
  ];
  const original = new Map(files.map((p) => [p, readFileSync(join(root, p), "utf8")]));
  const W = "scripts/gh/lib/watch.ts";
  const mutations = [
    ["a re-run is invisible (#628)", W, (s) => s.replace("if (cur.checkRunId !== seed.checkRunId) return true;", "")],
    ["the floor is clamped, not refused", W, (s) => s.replace("throw new UsageError(`interval ${n}s is below", "return POLL_FLOOR; throw new UsageError(`interval ${n}s is below")],
    ["INCONCLUSIVE reads as BLOCK", W, (s) => s.replace('return "INCONCLUSIVE";\n  const m', 'return "";\n  const m')],
    ["an in-flight run fires", W, (s) => s.replace('if (cls === "PENDING" || cls === "NONE") return false;', 'if (cls === "NONE") return false;')],
    ["--no-arm-wake ignored", W, (s) => s.replace("opts.armWake !== false &&", "true &&")],
    ["a rate limit is not exit 7", "scripts/gh/cli.ts", (s) => s.replace("      return EXIT.RATE;\n    }\n    if (res.seedError)", "      return EXIT.OK;\n    }\n    if (res.seedError)")],
    ["the deadline waits a whole interval", W, (s) => s.replace("Math.max(0, Math.min(wait * 1000, leftMs))", "wait * 1000")],
    ["ARM printed only at the end", W, (s) => s.replace("opts.onArm?.(reports);", "")],
    ["no takeover", "scripts/gh/lib/lock.ts", (s) => s.replace('process.kill(holder, "SIGTERM");', "void holder;")],
    ["a conflict never wakes", W, (s) => s.replace('cur.mergeable === "conflicting") return "conflict";', 'cur.mergeable === "never") return "conflict";')],
    ["footer shape drifts", "scripts/gh/lib/coord.ts", (s) => s.replace(" · ${id.harness} session", " · session")],
    ["the V2 type pin is lost", ".opencode/package.json", (s) => s.replace('"@opencode-ai/plugin"', '"@opencode-ai/plugin-gone"')],
  ];
  // Every arm runs the WHOLE gate against its OWN staged copy, and the arms run IN
  // PARALLEL: each gate run owns its local GitHub (port 0) and its lock directory, so the
  // runs share nothing. Sequential, eleven 15-second runs outgrew the plan runner's
  // never-hang bound; parallel, the self-test costs about one run.
  const tmp = mkdtempSync(join(tmpdir(), "check-gh-tools-st-"));
  const stageCopy = (name, file, text) => {
    const dir = join(tmp, String(name).replace(/[^a-z0-9]+/gi, "-"));
    for (const [p, t] of original) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), p === file ? text : t);
    }
    return dir;
  };
  const runGate = (dir) =>
    new Promise((done) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--root", dir], { stdio: "ignore" });
      child.on("exit", (code) => done(code));
    });
  const arms = [["unmutated", null, null], ...mutations];
  const results = await Promise.all(
    arms.map(async ([name, file, mutate]) => {
      if (!file) return { name, code: await runGate(stageCopy(name, null, null)) };
      const mutated = mutate(original.get(file));
      if (mutated === original.get(file)) return { name, applied: false };
      return { name, code: await runGate(stageCopy(name, file, mutated)) };
    }),
  );
  rmSync(tmp, { recursive: true, force: true });
  let stFails = 0;
  for (const r of results) {
    if (r.name === "unmutated") {
      if (r.code === 0) console.log("  PASS  the unmutated staged copy is GREEN");
      else {
        stFails += 1;
        console.error("  FAIL  the unmutated staged copy is not green");
      }
    } else if (r.applied === false) {
      stFails += 1;
      console.error(`  FAIL  mutation '${r.name}' did not APPLY (its anchor is gone)`);
    } else if (r.code === 0) {
      stFails += 1;
      console.error(`  FAIL  mutation '${r.name}' did NOT turn the gate red`);
    } else console.log(`  PASS  mutation '${r.name}' is caught`);
  }
  if (stFails) {
    console.error(`check-gh-tools --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-gh-tools --self-test: OK (every arm is live)");
  process.exit(0);
}

const lib = (p) => import(pathToFileURL(join(root, "scripts/gh/lib", p)).href);
const W = await lib("watch.ts");
const C = await lib("coord.ts");
const CLI = join(root, "scripts/gh/cli.ts");

// ── A. the contract, as pure functions ─────────────────────────────────────────────
{
  eq(W.parseItem("acme/widget#7")?.key, "acme/widget#7", "parseItem accepts owner/repo#num");
  eq(W.parseItem("https://github.com/acme/widget/pull/7?x=1")?.key, "acme/widget#7", "parseItem accepts a PR URL with a query");
  eq(W.parseItem("acme/widget/issues/7/")?.key, "acme/widget#7", "parseItem accepts owner/repo/issues/num/");
  eq(W.parseItem("acme/widget#x"), null, "parseItem refuses a malformed item");
  let threw = false;
  try {
    W.parseEvents("merged,bogus");
  } catch (e) {
    threw = e instanceof W.UsageError;
  }
  expect(threw, "parseEvents refuses an unknown event (no silent ignore)");

  // The live layers' judge: a call with the result PASSes, a call without it FAILs, no call
  // SKIPs — and an output that merely ECHOES the result, with no call behind it, is NOT a pass.
  {
    const called = /tools\.coord_watch\(/;
    const line = `MERGED   ${LIVE_MERGED_PR}  (unblocked)`;
    eq(judgeLiveCall(`execute {"code":"return await tools.coord_watch({})"}\n${line}`, called, LIVE_MERGED_LINE), "PASS", "the live judge: a call with its result is a PASS");
    eq(judgeLiveCall('execute {"code":"return await tools.coord_watch({})"}\nTIMEOUT', called, LIVE_MERGED_LINE), "FAIL", "the live judge: a call without its result is a FAIL");
    eq(judgeLiveCall(`the tool would print: ${line}`, called, LIVE_MERGED_LINE), "SKIP", "the live judge: an echoed result with no call is NOT a pass");
  }
  eq([...W.parseEvents(undefined)].join(","), "verdict,merged,closed,conflict", "the default events are your-own-PR events, a conflict with the base included");
  threw = false;
  try {
    W.checkInterval(60, {});
  } catch (e) {
    threw = e instanceof W.UsageError;
  }
  expect(threw, "checkInterval REFUSES a sub-floor interval (never clamps)");
  eq(W.checkInterval(1, { ALLOW_FAST_POLL: "1" }), 1, "ALLOW_FAST_POLL=1 admits a test interval");

  const snap = (o) => ({
    isPr: true, state: "open", merged: false, comments: 0, latestComment: "", updatedEpoch: Math.floor(Date.now() / 1000),
    headOid: "h1", checkRunId: "", checkStatus: "", checkConclusion: "", suiteStatus: "", reviewClass: "", ...o,
  });
  const done = (id, concl, extra = {}) => snap({ checkRunId: id, checkStatus: "completed", checkConclusion: concl, suiteStatus: "completed", ...extra });
  eq(W.classify(done("1", "success")), "PASS", "classify: a successful check run is PASS");
  eq(W.classify(done("1", "failure")), "BLOCK", "classify: a failed check run is BLOCK");
  eq(W.classify(done("1", "failure", { reviewClass: "INCONCLUSIVE" })), "INCONCLUSIVE", "classify: a failed run with an INCONCLUSIVE comment for the head is INCONCLUSIVE");
  eq(W.classify(snap({ checkRunId: "1", checkStatus: "in_progress", suiteStatus: "in_progress" })), "PENDING", "classify: an in-flight run is PENDING");
  eq(W.classify(done("1", "failure", { suiteStatus: "queued" })), "PENDING", "classify: a queued re-run of the suite is PENDING");
  eq(W.parseReviewClass("## validator INCONCLUSIVE — not a BLOCK"), "INCONCLUSIVE", "parseReviewClass: INCONCLUSIVE is never read as BLOCK");
  eq(W.parseReviewClass("## Review — BLOCK"), "BLOCK", "parseReviewClass: a BLOCK review");
  expect(W.verdictIsNew(done("1", "failure"), done("2", "failure")), "verdictIsNew: a RE-RUN (new check run) that BLOCKs again is new (#628)");
  expect(!W.verdictIsNew(done("1", "failure"), done("1", "failure")), "verdictIsNew: the same final run is not new");
  expect(W.verdictIsNew(snap({ checkRunId: "1", checkStatus: "in_progress", suiteStatus: "in_progress" }), done("1", "success")), "verdictIsNew: a run completing after arm is new");
  expect(!W.verdictIsNew(done("1", "failure"), snap({ checkRunId: "2", checkStatus: "in_progress", suiteStatus: "in_progress" })), "verdictIsNew: a run only in flight is not a verdict");
  const it = W.parseItem("acme/widget#1");
  expect(/^VERDICT  acme\/widget#1  BLOCK  validate \/ validate failure at h1  https:\/\/github\.com\/acme\/widget\/pull\/1$/.test(
    W.formatWake(it, "verdict", done("1", "failure"), done("2", "failure"), { stallMin: 60, check: W.DEFAULT_CHECK })),
  "formatWake: the VERDICT line carries the class, the check and the head");
  expect(W.armNotable(done("1", "failure")) && !W.armNotable(done("1", "success")), "armNotable: a BLOCK at arm needs action, a PASS does not");

  eq(C.canonicalVerb("taking_over"), "TAKING OVER", "canonicalVerb normalises a two-word verb");
  eq(C.canonicalVerb("BLOCKS"), "", "canonicalVerb refuses a word outside the closed set");
  eq(
    C.buildFooter({ agent: "s", session: "x", harness: "OpenCode", model: "M", confidence: "documentation reviewed", parent: "lead" }),
    "*Agent: `s` (subagent of `lead`) · OpenCode session `x`*\n*Assisted-by: OpenCode M (documentation reviewed)*",
    "buildFooter: the canonical two-line session footer",
  );
  const own = C.resolveIdentity({}, { CLAUDE_CODE_SESSION_ID: "cc-1", DSH_SESSION_ID: "d-1" });
  eq(`${own.harness}/${own.session}`, "Claude Code/cc-1", "resolveIdentity reads the harness's own session from its environment");
  const named = C.resolveIdentity({ harness: "OpenCode" }, { CLAUDE_CODE_SESSION_ID: "cc-1" });
  eq(named.session, "", "resolveIdentity never lends one harness's session id to another");
}

// ── the local GitHub ───────────────────────────────────────────────────────────────
// Layers B and C talk to the LOCAL server below with a dummy token; layer E talks to REAL
// GitHub, so it gets the environment as it was BEFORE these overrides.
const REAL_ENV = { ...process.env };
process.env.GITHUB_TOKEN = "test-token";
let scenario = () => ({});
let gqlCalls = 0;
const posts = [];
const created = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = (o, status = 200, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", "x-ratelimit-remaining": "4999", "x-ratelimit-reset": "1893456000", ...headers });
      res.end(JSON.stringify(o));
    };
    if (req.url === "/graphql") {
      const s = scenario(++gqlCalls);
      if (s.http) return json(s.body ?? {}, s.http, s.headers ?? {});
      const names = [...JSON.parse(body).query.matchAll(/\bi(\d+):/g)].map((m) => m[1]);
      const data = {};
      for (const n of names) {
        data[`i${n}`] = {
          pullRequest: {
            state: s.merged ? "MERGED" : "OPEN",
            merged: !!s.merged,
            mergeable: s.mergeable ?? "MERGEABLE",
            updatedAt: new Date().toISOString(),
            headRefOid: s.head ?? "h1",
            comments: { totalCount: (s.comments ?? []).length, nodes: s.comments ?? [] },
            commits: {
              nodes: [{ commit: { oid: s.head ?? "h1", checkSuites: { nodes: [{
                status: (s.suite ?? "COMPLETED"),
                workflowRun: { workflow: { name: "charly/pr-validator" } },
                checkRuns: { nodes: s.run ? [{ databaseId: s.run.id, status: s.run.status, conclusion: s.run.conclusion ?? null, startedAt: s.run.started ?? "2026-01-01T00:00:00Z" }] : [] },
              }] } } }],
            },
          },
          issue: null,
        };
      }
      return json({ data });
    }
    if (req.method === "POST" && /\/comments$/.test(req.url)) {
      posts.push(JSON.parse(body).body);
      return json({ html_url: "https://github.com/acme/widget/issues/1#issuecomment-9" }, 201);
    }
    if (req.method === "POST" && /\/issues$/.test(req.url)) {
      const payload = JSON.parse(body);
      created.push(payload);
      if (payload.title === "reject") return json({ message: "Validation Failed", errors: [{ resource: "Issue", field: "labels" }] }, 422);
      return json({ html_url: "https://github.com/acme/widget/issues/7", number: 7 }, 201);
    }
    if (/\/user$/.test(req.url)) return json({ login: "tester" });
    return json({ message: "not found" }, 404);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
process.env.GITHUB_API_URL = base;
const runtime = mkdtempSync(join(tmpdir(), "check-gh-tools-rt-"));

/** Run the CLI as a real child process, asynchronously (the server lives in this process). */
function cli(args, { env = {}, timeoutMs = 20000 } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, ALLOW_FAST_POLL: "1", GH_WATCH_RUNTIME_DIR: runtime, CLAUDE_CODE_SESSION_ID: "", DSH_SESSION_ID: "", ...env },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("exit", (code, signal) => {
      clearTimeout(t);
      resolveRun({ code: code ?? (signal ? 128 : -1), out, err, child });
    });
    resolveRun.child = child;
  });
}
const blockComment = (head) => ({ author: { login: "github-actions" }, body: `## Review — BLOCK\n\nHead SHA: \`${head}\`` });
const inconclusiveComment = (head) => ({ author: { login: "github-actions" }, body: `## validator INCONCLUSIVE — no review verdict\n\nHead SHA: \`${head}\`` });
const watch = (...items) => ["watch", "--interval", "1", ...items];

// ── B. the CLI, end to end ─────────────────────────────────────────────────────────
try {
  const failed = { id: 11, status: "COMPLETED", conclusion: "FAILURE" };

  scenario = () => ({ run: failed, comments: [blockComment("h1")] });
  let r = await cli(watch("acme/widget#1"));
  expect(r.code === 0 && /^ARM {6}acme\/widget#1  state=open  verdict=BLOCK/.test(r.out), "a BLOCK already on the head wakes at arm (ARM … verdict=BLOCK, exit 0)");

  gqlCalls = 0;
  scenario = (n) => ({ run: n === 1 ? failed : { id: 12, status: "COMPLETED", conclusion: "FAILURE" }, comments: [blockComment("h1")] });
  r = await cli([...watch("--no-arm-wake", "acme/widget#1")]);
  expect(r.code === 0 && /^VERDICT  acme\/widget#1  BLOCK  /.test(r.out), "a RE-RUN that BLOCKs again fires VERDICT BLOCK (#628), and --no-arm-wake did not re-report the arm");

  gqlCalls = 0;
  scenario = (n) => ({ run: n === 1 ? failed : { id: 13, status: "COMPLETED", conclusion: "SUCCESS" } });
  r = await cli(watch("--no-arm-wake", "acme/widget#1"));
  expect(r.code === 0 && /^VERDICT  acme\/widget#1  PASS  /.test(r.out), "a RE-RUN that passes fires VERDICT PASS");

  gqlCalls = 0;
  scenario = (n) =>
    n === 1
      ? { run: { id: 21, status: "IN_PROGRESS" }, suite: "IN_PROGRESS" }
      : { run: { id: 21, status: "COMPLETED", conclusion: "FAILURE" }, comments: [inconclusiveComment("h1")] };
  r = await cli(watch("acme/widget#1"));
  expect(r.code === 0 && /^VERDICT  acme\/widget#1  INCONCLUSIVE  /.test(r.out), "a run completing after arm fires; INCONCLUSIVE is its own class");

  scenario = () => ({ run: { id: 31, status: "IN_PROGRESS" }, suite: "IN_PROGRESS" });
  r = await cli([...watch("--timeout", "2", "acme/widget#1")]);
  expect(r.code === 4 && /^TIMEOUT  no event within 2s/.test(r.out), "a run only in flight never fires; the watch times out (exit 4)");

  // The deadline holds at the REAL poll floor: a 2 s timeout under a 300 s interval must end in
  // about 2 s, not after a full interval (the engine used to check the deadline only after
  // sleeping the whole interval — measured: `--timeout 60` returned after 300 s).
  {
    const t0 = Date.now();
    r = await cli(["watch", "--timeout", "2", "acme/widget#1"], { env: { ALLOW_FAST_POLL: "" } });
    const secs = (Date.now() - t0) / 1000;
    expect(r.code === 4 && secs < 15, `a timeout shorter than the 300 s poll floor ends on time (exit ${r.code} after ${secs.toFixed(1)} s)`);
  }

  // The ARM baseline is on stderr WHILE the watch runs — a session must be able to see that it
  // is armed and on what. It used to be printed only when the watch ended (measured live on
  // opencharly/marketplace#630: a 10-minute watch showed nothing until it fired).
  {
    const child = spawn(process.execPath, [CLI, ...watch("--timeout", "8", "acme/widget#1")], {
      env: { ...process.env, ALLOW_FAST_POLL: "1", GH_WATCH_RUNTIME_DIR: runtime },
    });
    let errSoFar = "";
    child.stderr.on("data", (d) => (errSoFar += d));
    const exited = new Promise((res) => child.on("exit", res));
    await new Promise((res) => setTimeout(res, 2500));
    const armedWhileRunning = /^ARM {6}acme\/widget#1  state=open/m.test(errSoFar) && child.exitCode === null;
    child.kill("SIGTERM");
    await exited;
    expect(armedWhileRunning, "the ARM baseline is printed when the watch arms, while it is still running");
  }

  scenario = () => ({ merged: true });
  r = await cli(watch("--events", "merged,closed,stall", "acme/widget#1"));
  expect(r.code === 0 && /^MERGED   acme\/widget#1/.test(r.out), "MERGED fires from the arm baseline");

  // A PR that conflicts with its base gets no validator run at all, so a verdict watch
  // that only waited for one would wait forever (opencharly/opencharly#1145, measured).
  scenario = () => ({ mergeable: "CONFLICTING" });
  r = await cli(watch("acme/widget#1"));
  expect(r.code === 0 && /^CONFLICT acme\/widget#1  conflicts with its base/.test(r.out) && /mergeable=conflicting/.test(r.err), "a PR that conflicts with its base wakes CONFLICT at arm (the default events)");
  r = await cli(["watch", "--interval", "1", "--no-arm-wake", "acme/widget#1"]);
  expect(r.code === 0 && /^CONFLICT acme\/widget#1/.test(r.out), "--no-arm-wake does NOT suppress a state event at arm — so a re-arming binding must retire the item, or it hot-loops");
  gqlCalls = 0;
  scenario = (n) => ({ mergeable: n === 1 ? "MERGEABLE" : "CONFLICTING" });
  r = await cli(watch("--timeout", "10", "acme/widget#1"));
  expect(r.code === 0 && /^CONFLICT acme\/widget#1/.test(r.out), "a conflict that appears after arm wakes CONFLICT");
  scenario = () => ({ mergeable: "UNKNOWN" });
  r = await cli(watch("--timeout", "2", "acme/widget#1"));
  expect(r.code === 4, "an uncomputed mergeability (UNKNOWN) never fires CONFLICT; the watch times out (exit 4)");

  r = await cli(["watch", "--interval", "60", "acme/widget#1"], { env: { ALLOW_FAST_POLL: "" } });
  expect(r.code === 5 && /below the 300s poll floor/.test(r.err), "a sub-floor interval is refused (exit 5)");

  scenario = () => ({ http: 429, body: { message: "API rate limit exceeded" }, headers: { "x-ratelimit-remaining": "0" } });
  r = await cli(watch("acme/widget#1"));
  expect(r.code === 7 && /FATAL gh watch: RATE-LIMITED/.test(r.err), "a rate limit is FATAL, never retried (exit 7)");

  scenario = () => ({ http: 500, body: { errors: [{ message: "boom" }] } });
  r = await cli(watch("acme/widget#1"));
  expect(r.code === 8 && /the initial poll failed/.test(r.err), "a failed initial poll exits 8");

  scenario = () => ({ run: { id: 41, status: "IN_PROGRESS" }, suite: "IN_PROGRESS" });
  const first = cli(watch("--timeout", "15", "acme/widget#9"));
  await new Promise((res) => setTimeout(res, 1500));
  const second = await cli(watch("--timeout", "2", "acme/widget#9"));
  const firstDone = await first;
  expect(firstDone.code === 143 && second.code === 4, `a second watch of the same items TAKES OVER the first (first exit ${firstDone.code}, second exit ${second.code})`);

  scenario = () => ({ run: failed, comments: [blockComment("h1")] });
  r = await cli(["status", "acme/widget#1"]);
  expect(r.code === 0 && /^STATUS   acme\/widget#1  state=open  verdict=BLOCK  check=completed\/failure/.test(r.out), "status reads the verdict on the head");

  const idArgs = ["--agent", "slug-x", "--harness", "OpenCode", "--session", "ses_x", "--model", "M", "--confidence", "documentation reviewed"];
  r = await cli(["footer", ...idArgs]);
  eq(r.out, "*Agent: `slug-x` · OpenCode session `ses_x`*\n*Assisted-by: OpenCode M (documentation reviewed)*\n", "footer prints the session footer");
  r = await cli(["footer", "--agent", "a", "--model", "M", "--confidence", "documentation reviewed"], { env: { CLAUDE_CODE_SESSION_ID: "cc-9" } });
  expect(r.code === 0 && r.out.startsWith("*Agent: `a` · Claude Code session `cc-9`*"), "footer reads Claude Code's own session id");
  r = await cli(["footer", "--agent", "a", "--model", "M", "--confidence", "documentation reviewed"]);
  expect(r.code === 5 && /missing --session/.test(r.err), "footer refuses a footer with no session (exit 5)");
  r = await cli(["comment", "handing_over", "acme/widget#1", "--body", "hi", "--dry-run", ...idArgs]);
  eq(r.out, `HANDING OVER\n\nhi\n\n*Agent: \`slug-x\` · OpenCode session \`ses_x\`*\n*Assisted-by: OpenCode M (documentation reviewed)*\n`, "comment --dry-run builds the verb, body and footer");
  r = await cli(["comment", "STATUS", "acme/widget#1", "--body", "posted", ...idArgs]);
  expect(r.code === 0 && /issuecomment-9/.test(r.out) && posts.at(-1)?.startsWith("STATUS\n\nposted\n\n*Agent:"), "comment POSTs the coordination comment and prints its URL");
  r = await cli(["comment", "BLOCKS", "acme/widget#1", ...idArgs]);
  expect(r.code === 5 && /invalid verb/.test(r.err), "comment refuses a verb outside the closed set (exit 5)");

  // ── B2. `issue`: both axes, the remedy, and the footer are mandatory ─────────────
  const issueArgs = ["issue", "--repo", "acme/widget", "--title", "a defect", "--category", "category:runtime", "--type", "type:fix", "--remedy", "candy/x/charly.yml run: step", "--cited", "R7"];
  r = await cli([...issueArgs, "--dry-run", ...idArgs]);
  expect(
    r.code === 0 &&
      r.out.includes("### Category\n\ncategory:runtime") &&
      r.out.includes("### Type\n\ntype:fix") &&
      r.out.includes("### Remedy / files the remedy will touch\n\ncandy/x/charly.yml run: step") &&
      r.out.includes("### Cited design decision or org-rulebook rule (or `none`)\n\nR7") &&
      r.out.trimEnd().endsWith("*Assisted-by: OpenCode M (documentation reviewed)*"),
    "issue --dry-run emits the four form fields and the session footer",
  );
  eq(created.length, 0, "issue --dry-run writes nothing");
  r = await cli([...issueArgs, ...idArgs]);
  expect(
    r.code === 0 && r.out.includes("/issues/7") && created.at(-1)?.labels?.join(",") === "category:runtime,type:fix" && created.at(-1)?.body?.includes("### Remedy"),
    "issue POSTs both axes as labels and the four-field body",
  );
  r = await cli(["issue", "--repo", "acme/widget", "--title", "t", "--category", "category:runtime", "--type", "type:fix", ...idArgs]);
  expect(r.code === 5 && /--remedy is required/.test(r.err), "issue refuses without --remedy (exit 5)");
  r = await cli(["issue", "--repo", "acme/widget", "--title", "t", "--category", "runtime", "--type", "type:fix", "--remedy", "x", ...idArgs]);
  expect(r.code === 5 && /must be 'category:<value>'/.test(r.err), "issue refuses a category without its axis prefix (exit 5)");
  r = await cli(["issue", "--repo", "acme/widget", "--title", "reject", "--category", "category:runtime", "--type", "type:fix", "--remedy", "x", ...idArgs]);
  expect(r.code === 5 && /Validation Failed/.test(r.err), "issue surfaces an API label rejection as exit 5 (never a silent create)");

  // ── C. the OpenCode binding, in process ──────────────────────────────────────────
  const plugin = (await import(pathToFileURL(join(root, ".opencode/plugins/coord.ts")).href)).default;
  const tools = {};
  await plugin.setup({
    location: { directory: mkdtempSync(join(tmpdir(), "check-gh-tools-oc-")) },
    tool: { transform: async (cb) => cb({ add: (t) => (tools[t.name] = t) }) },
  });
  expect(!!tools.coord_comment && !!tools.coord_footer && !!tools.coord_watch, "OpenCode registers coord_comment, coord_footer and coord_watch");
  expect(typeof plugin.server === "function" && typeof plugin.id === "string" && plugin.id.length > 0, "the coord definition has an id and BOTH setup() (>=2.0) and server() (1.x)");
  // The declared @opencode-ai/plugin version must carry the ./v2/promise export the
  // bindings type against: the declaration ALWAYS, the installed export when present.
  const pkgPath = join(root, ".opencode/package.json");
  if (!existsSync(pkgPath)) fail(".opencode/package.json is missing (the V2 type pin)");
  else {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const declared = pkg?.dependencies?.["@opencode-ai/plugin"];
    expect(typeof declared === "string" && declared.length > 0 && pkg?.type === "module", `.opencode/package.json declares @opencode-ai/plugin (${declared}) and type=module`);
    const installed = join(root, ".opencode/node_modules/@opencode-ai/plugin/package.json");
    if (existsSync(installed)) {
      const ip = JSON.parse(readFileSync(installed, "utf8"));
      expect(!!ip?.exports?.["./v2/promise"], `the installed @opencode-ai/plugin ${ip.version} exports ./v2/promise`);
    } else console.log("  SKIP  the installed @opencode-ai/plugin is absent (run `bun install` in .opencode to assert its ./v2/promise export)");
  }
  const ftr = await tools.coord_footer.execute({ agent: "slug-x", model: "M", confidence: "documentation reviewed" }, { sessionID: "ses_live" });
  eq(ftr.content, "*Agent: `slug-x` · OpenCode session `ses_live`*\n*Assisted-by: OpenCode M (documentation reviewed)*", "coord_footer names the live OpenCode session");
  const dry = await tools.coord_comment.execute({ verb: "claim", item: "acme/widget#1", dryRun: true, agent: "a", model: "M", confidence: "documentation reviewed" }, { sessionID: "ses_live" });
  expect(/^CLAIM\n\n\*Agent: `a` · OpenCode session `ses_live`\*/.test(dry.content), "coord_comment (dry run) builds the shared comment");
  process.env.ALLOW_FAST_POLL = "1";
  scenario = () => ({ run: failed, comments: [blockComment("h1")] });
  const w = await tools.coord_watch.execute({ items: ["acme/widget#1"], interval: 1, timeout: 5 }, {});
  expect(/^ARM {6}acme\/widget#1  state=open  verdict=BLOCK/.test(w.content), "coord_watch runs the shared engine (a BLOCK at arm wakes)");
  delete process.env.ALLOW_FAST_POLL;

  // ── D. the footer is the linter's shape ──────────────────────────────────────────
  const lint = join(root, "marketplace/scripts/pr_body_lint.py");
  if (!existsSync(lint)) {
    console.log("  SKIP  the footer vs pr_body_lint.py SESSION_LINE: marketplace/ is not checked out (the comparison did not run)");
  } else {
    const line = "*Agent: `slug-x` · OpenCode session `ses_x`*";
    const py = spawnSync("python3", ["-c", "import sys; sys.path.insert(0, sys.argv[1]); from pr_body_lint import SESSION_LINE; sys.exit(0 if SESSION_LINE.fullmatch(sys.argv[2]) else 1)", dirname(lint), line]);
    expect(py.status === 0, "the footer's session line is the shape pr_body_lint.py's SESSION_LINE accepts");
  }

  // ── E. LIVE: the REAL opencode binary, the shared lib, REAL GitHub ─────────────────
  // A throwaway project carries `.opencode/plugins/coord.ts` AND `scripts/gh/` (the
  // binding imports the shared lib by relative path) and NO `marketplace/`, so a pass
  // proves the binding depends on no shell script and no submodule pin. The model's
  // decision to call a tool is stochastic: the load/no-reload assertions are HARD, the
  // tool-call ones live-or-skip.
  const realCredential = hasGithubCredential(REAL_ENV);
  if (process.env.LIVE_OPENCODE !== "1") {
    console.log("  SKIP  live opencode layer (set LIVE_OPENCODE=1 to run the real binary end to end)");
  } else if (spawnSync("sh", ["-c", "command -v opencode"]).status !== 0) {
    fail("LIVE_OPENCODE=1 but no `opencode` binary on PATH");
  } else if (!realCredential) {
    console.log("  SKIP  live opencode layer: no GitHub credential (GITHUB_TOKEN, GH_TOKEN or a logged-in gh) for the real GitHub read");
  } else {
    const proj = mkdtempSync(join(tmpdir(), "check-gh-tools-live-"));
    try {
      mkdirSync(join(proj, ".opencode/plugins"), { recursive: true });
      cpSync(join(root, ".opencode/plugins/coord.ts"), join(proj, ".opencode/plugins/coord.ts"));
      cpSync(join(root, "scripts/gh"), join(proj, "scripts/gh"), { recursive: true });
      expect(!existsSync(join(proj, "marketplace")), "real opencode: the throwaway project has NO marketplace checkout");
      // The DEFAULT agent with a plain request. A custom "test runner" agent that was told to
      // run a snippet made the model call no tool at all — every run of this layer skipped,
      // so it proved nothing about the tool path (measured; opencharly/opencharly#1170).
      writeFileSync(
        join(proj, ".opencode/coord.conf"),
        "agent=coord-live\nharness=OpenCode\nmodel=DeepSeek V4.1 Flash\nconfidence=documentation reviewed\n",
      );
      spawnSync("git", ["init", "-q"], { cwd: proj });
      const model = process.env.COORD_LIVE_MODEL ?? "ollama-cloud/deepseek-v4-pro";
      const opencode = (snippet) =>
        new Promise((done) => {
          const child = spawn("opencode", ["run", "--standalone", "--auto", "--model", model, snippet], {
            cwd: proj,
            // opencode takes its project directory from PWD, not from the process cwd: with the
            // gate's own PWD inherited, the binding read the umbrella worktree's .opencode/ and
            // never saw the throwaway project's coord.conf (measured).
            env: { ...REAL_ENV, PWD: proj },
          });
          let text = "";
          child.stdout.on("data", (d) => (text += d));
          child.stderr.on("data", (d) => (text += d));
          const t = setTimeout(() => child.kill("SIGKILL"), 240000);
          child.on("exit", () => {
            clearTimeout(t);
            done(text);
          });
        });

      let text = "";
      for (let attempt = 1; attempt <= 3 && !/tools\.coord_comment\(/.test(text); attempt++) {
        text += await opencode(
          `Call the coord_comment tool with verb "STATUS", item "${LIVE_MERGED_PR}", body "live dry run", dryRun true (it posts nothing), and report the exact text it returns.`,
        );
      }
      if (process.env.COORD_LIVE_DEBUG) writeFileSync(process.env.COORD_LIVE_DEBUG, text);
      expect(!/failed to load plugin|must default export|Cannot find module|ERR_MODULE_NOT_FOUND/i.test(text), "real opencode: the binding and its shared lib loaded (no load error)");
      expect(!/\breload\b/i.test(text), "real opencode: no server reload during coord_comment");
      // PASS / FAIL / SKIP by the one shared judge (layer A tests it): PASS needs the model's own
      // execute trace of the tool AND its expected output — an echoed footer with no call is not a pass.
      const commentVerdict = judgeLiveCall(text, /tools\.coord_comment\(/, /STATUS[\s\S]*\*Agent: `coord-live` · OpenCode session `ses_[A-Za-z0-9]+`\*/);
      if (commentVerdict === "PASS") ok("real opencode: coord_comment (dry run) built the verb and the footer with the LIVE session id");
      else if (commentVerdict === "FAIL") fail("real opencode: coord_comment was called but did not return the verb and the live-session footer");
      else console.log(`  SKIP  real opencode: the model (${model}) did not invoke coord_comment — layers B and C prove the executor`);

      let wtext = "";
      // Retry only while the model has not called the tool at all; once it has, its result decides.
      for (let attempt = 1; attempt <= 3 && !/tools\.coord_watch\(/.test(wtext); attempt++) {
        wtext += await opencode(
          `Call the coord_watch tool with items ["${LIVE_MERGED_PR}"], events "merged", timeout 60, and report the exact line it returns.`,
        );
      }
      expect(!/\breload\b/i.test(wtext), "real opencode: no server reload during coord_watch");
      const watchVerdict = judgeLiveCall(wtext, /tools\.coord_watch\(/, LIVE_MERGED_LINE);
      if (watchVerdict === "PASS") ok("real opencode: coord_watch read REAL GitHub and returned the MERGED wake line");
      else if (watchVerdict === "FAIL") fail(`real opencode: coord_watch was called on ${LIVE_MERGED_PR} but returned no MERGED wake line`);
      else console.log(`  SKIP  real opencode: the model (${model}) did not invoke coord_watch — layers B and C prove the executor`);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  }
} finally {
  server.close();
  rmSync(runtime, { recursive: true, force: true });
}

if (failures) {
  console.error(`check-gh-tools: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-gh-tools: OK");
process.exit(0);
