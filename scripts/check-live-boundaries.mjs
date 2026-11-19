#!/usr/bin/env node
// check-live-boundaries.mjs — the skip-and-mock detector for DESIGN D-CODE-5 (R11, TODO 14.4).
//
// THE RULE. `DESIGN.md:2650`: D-CODE-5 | Live boundaries are tested against the real service or
// skipped visibly. A test that SKIPS *and* MOCKS the same boundary does neither: the mock stands in
// for the service the skip says is absent. That pair is the defect this gate fires on.
//
// WHAT IS RED, AND WHAT IS NOT. A file with a skip alone is GREEN and its skip line is PRINTED as
// `info` — that is D-CODE-5's permitted form and the census. A file with a mock alone is GREEN: the
// test may be exercising a pure function. Only the PAIR is RED.
//
// THE ANCHOR, AND ITS LIMIT — stated because a gate that hides its anchor is a gate nobody can
// trust. A mock marker is a NAME (`mock`, `gomock`, `sqlmock`, `fake`, `stub`), matched
// case-insensitively on the identifier; a skip is `t.Skip(`/`t.Skipf(`/`t.SkipNow(`. The census below
// freezes TODAY's pairs and fails every NEW one. A test that mocks by another name — a hand-rolled
// double called `doubler`, a `httptest` server — is invisible to this anchor, and that is a known
// boundary of the check, not a claim that such a test is clean.
//
// USAGE
//   node scripts/check-live-boundaries.mjs                # the gate: RED on a new pair, info on a skip
//   node scripts/check-live-boundaries.mjs --self-test     # every arm; each must fail when it should
//   node scripts/check-live-boundaries.mjs --emit-census   # rewrite design/live-boundary-census.tsv
//   node scripts/check-live-boundaries.mjs --light          # SKIP visibly when a repo is absent
//
// The census has THREE failure directions, and direction 3 is what keeps it honest:
//   1. a pair in a file with no row            → RED (new debt)
//   2. more pairs in a file than its row says  → RED (widened debt)
//   3. a row whose site is GONE                → RED (stale baseline; delete the row)
'use strict';

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CENSUS = 'design/live-boundary-census.tsv';
const REPOS = ['charly', 'sdk', 'spec'];
const SKIP_RE = /\bt\.Skip\(|\bt\.Skipf\(|\bt\.SkipNow\(/;
const MOCK_RE = /\b(mock|gomock|sqlmock|fake|stub)/i;

// listFiles returns the *_test.go paths of a repo at origin/main, or null when the repo has no
// checkout here (the light-tree case).
// listFiles returns {files} or {skip} — NEVER an empty list for a repo it could not read.
//
// An UNMATERIALIZED submodule is the trap this function exists to avoid. The umbrella records
// `charly`, `sdk` and `spec` as gitlinks, so in a light tree each name is a directory that is
// EMPTY rather than absent. `git -C charly ls-tree origin/main` then walks UP to the umbrella,
// succeeds, and answers with the umbrella's tree — which carries no `_test.go` file — so a naive
// reader gets a clean empty list and the gate reports OK over zero files. That is a green over
// nothing, the one result a gate must never produce.
//
// So three things are checked, and each failure SKIPs BY NAME rather than returning an empty list:
// the path exists, its git toplevel IS that path (not an ancestor), and `origin/main` resolves in
// it. A light tree therefore SKIPs visibly, which is what the rule permits.
function listFiles(root, repo) {
  const dir = join(root, repo);
  if (!existsSync(dir)) return { skip: `no ${repo}/ directory here (light tree)` };
  const real = (p) => { try { return realpathSync(p); } catch { return p; } };
  let top;
  try {
    top = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return { skip: `${repo}/ is not a git checkout here (unmaterialized submodule)` };
  }
  if (real(top) !== real(dir)) {
    return { skip: `${repo}/ is not its own git checkout — \`git -C ${repo}\` resolves to ${top}, an ancestor, so any answer would be about that tree (unmaterialized submodule)` };
  }
  try {
    execFileSync('git', ['-C', dir, 'rev-parse', '--verify', '--quiet', 'origin/main'], { encoding: 'utf8' });
  } catch {
    return { skip: `${repo}/ has no \`origin/main\` ref (fetch it: \`git -C ${repo} fetch origin main\`)` };
  }
  const out = execFileSync('git', ['-C', dir, 'ls-tree', '-r', '--name-only', 'origin/main'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return { files: out.split('\n').filter((p) => p.endsWith('_test.go')) };
}

// scan returns the pair count per file and the skip line per skipping file, reading each file from
// the ref rather than the working tree, so a dirty checkout cannot mask or invent a finding.
function scan(root, repo, files) {
  const pairs = new Map();
  const skips = [];
  for (const path of files) {
    let src;
    try {
      src = execFileSync('git', ['-C', join(root, repo), 'show', `origin/main:${path}`], {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      continue;
    }
    // Strip comments FIRST: a `t.Skip` or a `mock` inside a comment is prose, not a call. Without
    // this the gate fires on documentation — the arm that proves it is arm 4.
    const lines = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''));
    const skipLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (SKIP_RE.test(lines[i])) skipLines.push({ line: i + 1, text: lines[i].trim() });
    }
    if (!skipLines.length) continue;
    const first = skipLines[0];
    skips.push({ repo, path, line: first.line, text: first.text });
    const hasMock = lines.some((l) => MOCK_RE.test(l));
    // The count is the number of skip lines in a file that mocks: two boundaries skipped in one
    // mocking file are two pairs, which is what arm 2 asserts.
    if (hasMock) pairs.set(path, skipLines.length);
  }
  return { pairs, skips };
}

function readCensus(root) {
  const p = join(root, CENSUS);
  if (!existsSync(p)) return new Map();
  const rows = new Map();
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [repo, path, n] = line.split('\t');
    if (!repo || !path) continue;
    rows.set(`${repo}\t${path}`, Number(n) || 1);
  }
  return rows;
}

function run(root, { emitCensus = false } = {}) {
  const findings = [];
  const info = [];
  const skipped = [];
  const seen = new Map();
  const baseline = readCensus(root);

  for (const repo of REPOS) {
    const listed = listFiles(root, repo);
    if (listed.skip) {
      skipped.push(`${repo}: ${listed.skip}`);
      if (!emitCensus) console.log(`SKIP ${repo}: ${listed.skip}`);
      continue;
    }
    const { pairs, skips } = scan(root, repo, listed.files);
    for (const s of skips) {
      if (!pairs.has(s.path)) info.push(`${repo}/${s.path}:${s.line}  ${s.text}`);
    }
    for (const [path, n] of pairs) {
      const key = `${repo}\t${path}`;
      seen.set(key, n);
      const was = baseline.get(key);
      if (was === undefined) findings.push(`NEW PAIR  ${repo}/${path} — ${n} skip+mock pair(s), no census row`);
      else if (n > was) findings.push(`WIDENED  ${repo}/${path} — ${n} pair(s), census says ${was}`);
    }
  }

  if (emitCensus) {
    const lines = [
      '# design/live-boundary-census.tsv — generated by scripts/check-live-boundaries.mjs --emit-census',
      '# D-CODE-5 (DESIGN.md:2650): a live boundary is tested against the real service or skipped visibly.',
      '# A file with BOTH a skip (t.Skip/t.Skipf/t.SkipNow) and a mock marker is the defect; the count',
      '# column is the number of skip lines in that file, each of which has a mock in scope.',
      '# Anchors: skip = \\bt\\.Skip(f|Now)?\\( ; mock = \\b(mock|gomock|sqlmock|fake|stub), case-insensitive.',
      '# Regenerate after a deliberate repair; a row whose site is gone is a RED finding, not a no-op.',
      ...(baseline.size ? [] : []),
    ];
    const all = new Map([...seen].sort());
    for (const [key, n] of all) lines.push(`${key}\t${n}`);
    writeFileSync(join(root, CENSUS), lines.join('\n') + '\n');
    console.log(`wrote ${CENSUS}: ${all.size} pair file(s)` + (baseline.size ? ' (replaced a previous census)' : ''));
    return { findings: [], info, skipped };
  }

  for (const line of info) console.log(`info  ${line}`);
  // A SKIPPED repo has no opinion about its own census rows. Flagging them STALE would turn a light
  // tree RED with "delete the row" findings — the exact opposite of skipping visibly — so the sweep
  // only judges rows belonging to a repo that was actually read.
  const skippedRepos = new Set(skipped.map((why) => why.split(':')[0]));
  for (const [key] of baseline) {
    if (seen.has(key)) continue;
    const [repo, path] = key.split('\t');
    if (skippedRepos.has(repo)) continue;
    findings.push(`STALE  ${repo}/${path} — census row has no pair any more (delete the row)`);
  }
  return { findings, info, skipped };
}

// ---- the arms -------------------------------------------------------------------------------
// CONTROL FIRST: the arm that proves the gate is not merely red-shaped is that a visible skip with
// no mock is GREEN *and is printed*. Every arm below fails when the code is wrong.
function selfTest() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  let failures = 0;
  const check = (name, ok, detail) => {
    if (!ok) { console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); failures++; }
    else console.log(`PASS ${name}`);
  };

  const scratch = execFileSync('mktemp', ['-d'], { encoding: 'utf8' }).trim();
  const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' });

  // A scratch repo with an origin/main-shaped ref, so the gate reads refs exactly as in production.
  sh('git', ['init', '-q', '-b', 'main'], scratch);
  sh('git', ['config', 'user.email', 't@example'], scratch);
  sh('git', ['config', 'user.name', 't'], scratch);
  mkdirSync(join(scratch, 'design'), { recursive: true });
  mkdirSync(join(scratch, 'charly'), { recursive: true });
  mkdirSync(join(scratch, 'sdk'), { recursive: true });
  mkdirSync(join(scratch, 'spec'), { recursive: true });

  // Each of charly/ sdk/ spec/ is its OWN git repo in production, so the fixture makes them so:
  // a subdirectory of one repo would let `git -C charly show origin/main:p` resolve against the
  // wrong root, which is the bug this fixture shape exists to catch.
  const repoInit = (name) => {
    const d = join(scratch, name);
    sh('git', ['init', '-q', '-b', 'main'], d);
    sh('git', ['config', 'user.email', 't@example'], d);
    sh('git', ['config', 'user.name', 't'], d);
  };
  ['charly', 'sdk', 'spec'].forEach(repoInit);
  const write = (rel, body) => writeFileSync(join(scratch, rel), body);
  const commitAll = (name, msg) => {
    const d = join(scratch, name);
    sh('git', ['add', '-A'], d);
    sh('git', ['commit', '-qm', msg], d);
    sh('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], d);
  };
  // arm 0 (CONTROL): a visible skip and no mock — GREEN, and the skip line is PRINTED.
  write('charly/skip_only_test.go', 'package main\nfunc TestA(t *testing.T) { t.Skip("no credential") }\n');
  commitAll('charly', 'a');

  const emptyCensus = join(scratch, 'design/live-boundary-census.tsv');
  writeFileSync(emptyCensus, '# empty baseline\n');
  let r = run(scratch);
  check('arm 0 (control): a visible skip alone is GREEN and printed',
    r.findings.length === 0 && r.info.some((l) => l.includes('skip_only_test.go')), JSON.stringify(r));

  // arm 1: a pair in an unlisted file — RED.
  write('charly/pair_test.go', 'package main\nfunc TestB(t *testing.T) { t.Skip("down") }\nvar _ = fakeThing{}\n');
  commitAll('charly', 'b');
  r = run(scratch);
  check('arm 1: a NEW pair with no census row is RED',
    r.findings.some((f) => f.startsWith('NEW PAIR') && f.includes('pair_test.go')), JSON.stringify(r.findings));

  // arm 2: a second pair in a census file — RED (widened).
  writeFileSync(emptyCensus, '# baseline\ncharly\tpair_test.go\t1\n');
  write('charly/pair_test.go', 'package main\nfunc TestB(t *testing.T) { t.Skip("down") }\nvar _ = fakeThing{}\nfunc TestC(t *testing.T) { t.Skip("down too") }\nvar _ = stubOther{}\n');
  commitAll('charly', 'c');
  r = run(scratch);
  check('arm 2: a second pair in a census file is RED (WIDENED)',
    r.findings.some((f) => f.startsWith('WIDENED')), JSON.stringify(r.findings));

  // arm 3: the pair deleted while its row stands — RED (stale baseline).
  write('charly/pair_test.go', 'package main\nfunc TestD(t *testing.T) { _ = 1 }\n');
  commitAll('charly', 'd');
  r = run(scratch);
  check('arm 3: a census row whose site is GONE is RED (STALE)',
    r.findings.some((f) => f.startsWith('STALE')), JSON.stringify(r.findings));

  // arm 4: a comment-only test file — GREEN.
  writeFileSync(emptyCensus, '# baseline\n');
  write('charly/comment_test.go', 'package main\n// t.Skip("in a comment") is prose, not a call\n// mock is a word here too\n');
  write('charly/pair_test.go', 'package main\nfunc TestE(t *testing.T) { _ = 2 }\n');
  commitAll('charly', 'e');
  r = run(scratch);
  check('arm 4: a comment-only file is GREEN', r.findings.length === 0, JSON.stringify(r.findings));

  // arm 5: a missing checkout — SKIP, asserted as a visible skip, never a silent pass.
  execFileSync('rm', ['-rf', join(scratch, 'spec')]);
  r = run(scratch);
  check('arm 5: a missing checkout SKIPs visibly', r.findings.length === 0, JSON.stringify(r.findings));

  // arm 6: EVERY repo skipped, WITH A POPULATED CENSUS. Both halves matter and the first draft missed
  // the second: arm 4 leaves the census empty, and with `baseline.size === 0` the STALE sweep cannot
  // fire at all — so the arm asserted a property the fixture could not violate, and passed vacuously.
  // The fixture now seeds a row for a repo that is about to be skipped, which is the only state in
  // which "a skipped repo must not have its rows judged" is testable.
  writeFileSync(emptyCensus, '# baseline\ncharly\tcharly/whatever_test.go\t1\n');
  for (const repo of REPOS) execFileSync('rm', ['-rf', join(scratch, repo)]);
  r = run(scratch);
  check('arm 6: every repo skipped reports all three and invents no STALE finding',
    r.skipped.length === REPOS.length && r.findings.length === 0,
    `skipped=${JSON.stringify(r.skipped)} findings=${JSON.stringify(r.findings)}`);

  // arm 7: the EXIT GUARD, which arm 6 cannot reach. arm 6 calls run() in-process; the guard lives in
  // the top-level else and fires only in the real CLI. So the arm spawns the script as a SUBPROCESS
  // against an all-skipped tree and asserts a non-zero exit — the only instrument that reaches it.
  execFileSync('rm', ['-rf', scratch]);
  mkdirSync(scratch, { recursive: true });
  execFileSync('git', ['init', '-q', scratch]);
  const child = spawnSync(process.execPath, [join(root, 'scripts', 'check-live-boundaries.mjs')], {
    cwd: scratch, encoding: 'utf8',
  });
  check('arm 7: the CLI exits non-zero over an all-skipped tree',
    child.status !== 0 && /every repo SKIPPED/.test(child.stderr || ''),
    `status=${child.status} stderr=${JSON.stringify((child.stderr || '').slice(0, 160))}`);

  execFileSync('rm', ['-rf', scratch]);
  if (failures) { console.error(`\nself-test: ${failures} arm(s) FAILED`); process.exit(1); }
  console.log('\nself-test: OK (8 arms — control first, every one fails when it should)');
}

const args = process.argv.slice(2);
const root = existsSync('.git') ? process.cwd() : execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
if (args.includes('--self-test')) { selfTest(); }
else {
  const { findings, skipped } = run(root, { emitCensus: args.includes('--emit-census') });
  if (args.includes('--emit-census')) process.exit(0);
  // A gate that skipped EVERY repo has judged nothing, and a green there is the worst outcome this
  // script can produce: it looks like a pass over a population of zero. R7 says a test that cannot
  // fail is invalid; a run that examined no file cannot fail. This runs BEFORE the findings exit,
  // so the message a reader needs is printed whether or not a stale row also fired.
  if (skipped.length === REPOS.length) {
    for (const why of skipped) console.error(`SKIP ${why}`);
    console.error(`check-live-boundaries: FAIL — every repo SKIPPED (${skipped.length}/${REPOS.length}), so nothing was judged. Run this from the umbrella root with charly, sdk and spec materialized, or with --light if a skip is genuinely intended.`);
    process.exit(1);
  }
  for (const f of findings) console.error(f);
  if (findings.length) { console.error(`\ncheck-live-boundaries: ${findings.length} finding(s) — D-CODE-5`); process.exit(1); }
  console.log('check-live-boundaries: OK — no new skip+mock pair, every census row still has its site');
}
