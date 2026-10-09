#!/usr/bin/env node
// check-task-contexts.mjs — every step of every `charly task` in THIS repo's charly.yml
// must be REACHABLE by the plan runner.
//
// The defect this closes (opencharly/opencharly#413): the seven maintenance tasks
// (`map`, `pins`, `self-test`, `hooks`, `sync`, `skills`, `prune`) declared
// `context: [deploy]` on their only step. `Runner.ContextSkipReason`
// (sdk/kit/runner.go) activates exactly TWO execution contexts — box mode → `build`,
// live mode → `runtime` — and `PlanGrammar.InContext` (sdk/checkkit/checkkit.go) is a
// plain membership test over `effectiveContexts(op)`. A step declaring `[deploy]` is in
// NEITHER set, so it names a context no mode has: the instant such a step is walked by a
// driver that consults the grammar, it is a silently dead step.
//
// It is NOT dead at the CLI, and the reason is a seam rather than an accident: the `task`
// verb installs its OWN grammar, `taskGrammar{InContext → true}`
// (plugin-task/candy/plugin-task/grammar.go, wired in newTaskRunner,
// plugin-task/candy/plugin-task/runner.go), documented there as "the grammar SEAM's
// purpose … it is not a workaround" — a task is host-native and has no image-build
// timeline to separate. So a task's own steps are never gated, every `charly task <name>`
// ran, and the value could sit there wrong without anyone noticing. The check engine's own
// plans (candy `plan:`, check beds) are walked with `checkkit.PlanGrammar` instead, where
// the value IS consulted. The declaration must therefore name a mode that exists, not one
// whose only property is that its owner ignores it.
//
// ASSERTED — each proven LIVE by --self-test against a mutation of a real region of the
// file, never against a copy of it (R2: the gate reads the shipped text).
//
//   A. Every step's DECLARED `context:` set intersects the active contexts [build,
//      runtime]. A set disjoint from both — today's `[deploy]` — is a no-op in every mode
//      the runner has.
//   B. Every step declares `context:` at all. `effectiveContexts` falls back to the verb's
//      VerbCatalog default when `op.Context` is empty — and Go's `len(op.Context) > 0` guard
//      does not fire on a zero-length slice, so `context: []` falls through identically. The
//      steps in this file all desugar to the generic `plugin` verb (every `<word>: <input>`
//      sugar key becomes plugin/plugin_input internally — charly/charly/reserved_registry.go,
//      `internalOnlyVerbs`), whose catalog entry is the PERMISSIVE ctxBuildDeployRuntime. So an
//      omission is not a no-op here — it inherits "may run in any mode". B is therefore not a
//      no-op check; it is the file's own stated invariant (every step names its context, so no
//      reader has to know which default would have applied), and it is not decorative: the one
//      narrow builtin (`config`: build-only) shows the inherited default is not always
//      permissive, and a step that quietly inherits a NARROW one is a live no-op in live mode.
//
// NOT asserted, and why: what an OMITTED `context:` resolves to. Answering that needs the
// VerbCatalog per verb AND the desugar's rewrite rule, both in the charly/spec and
// charly/charly submodules — so this gate would have to read another repo's Go source to
// decide whether a missing key is harmless. B sidesteps the whole question by requiring every
// step in this file to state its own context. The ACTIVE pair `[build, runtime]` is likewise
// hard-coded rather than derived, and its two call sites are named above so the constant can be
// re-checked by reading them.
//
// Usage: node scripts/check-task-contexts.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const yamlRel = "charly.yml";

/** The execution contexts the plan runner can actually activate. `Runner.ContextSkipReason`
 *  (sdk/kit/runner.go) selects exactly one per run: box mode → `build`, every live mode →
 *  `runtime`. `deploy` is a real ExecContext (`spec/spec/verb_context.go`) — it is the
 *  install-lowering axis for candy build/deploy verbs — but it is NOT a mode the plan runner
 *  ever activates, so a step whose context set is `[deploy]` alone never runs. */
const ACTIVE = ["build", "runtime"];

// Inside a `plan:` every list item IS a step — that is the grammar's own shape, not a
// convention this gate imposes — so the opener is matched GENERICALLY rather than by
// enumerating the step verbs. An enumeration (`check|run|agent_check|agent_run`, say) would
// make any step written with a sugar word outside the list invisible to this gate, and a
// completeness gate that cannot see a step is worse than no gate: it reports "every step is
// reachable" over a set it silently truncated. `import:` is a list of `- charly: <path>`
// items OUTSIDE any plan, so the `inPlan` gate below — not this regex — is what excludes it.
const STEP_RE = /^(\s*)-\s+([A-Za-z0-9_.-]+):\s*(.*)$/;
const ENTITY_RE = /^([A-Za-z0-9_.-]+):\s*$/;
const PLAN_RE = /^\s*plan:\s*$/;
const BLOCK_SCALAR_RE = /:\s*[|>][-+0-9]*\s*$/;
const CONTEXT_RE = /^\s*context:\s*(.*)$/;

const indentOf = (l) => l.match(/^\s*/)[0].length;

/** Skip a block scalar's body IN PLACE (a `command: |` body is arbitrary text, never keys);
 *  returns the index of the block's last line. */
function skipBlockScalar(lines, i) {
  const ind = indentOf(lines[i]);
  let k = i;
  while (k + 1 < lines.length) {
    const nxt = lines[k + 1];
    if (nxt.trim() !== "" && indentOf(nxt) <= ind) break;
    k += 1;
  }
  return k;
}

/** Split a `[a, b]` flow sequence into its items. */
function flowItems(s) {
  return s
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((x) => x.trim().replace(/^["']|["']$/g, ""))
    .filter((x) => x !== "");
}

/**
 * Every step of every `plan:` in the file, with its DECLARED `context:` — `null` when the
 * key is absent OR present-but-empty (Go's `len(op.Context) > 0` guard treats a zero-length
 * slice exactly like an absent one, so both fall through to the same catalog default).
 */
function parseTaskSteps(src) {
  const lines = src.split("\n");
  const steps = [];
  let entity = null;
  let inPlan = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    if (indentOf(line) === 0) {
      const e = line.match(ENTITY_RE);
      entity = e ? e[1] : null;
      inPlan = false;
      continue;
    }
    if (PLAN_RE.test(line)) {
      inPlan = true;
      continue;
    }
    if (!inPlan) continue;
    if (BLOCK_SCALAR_RE.test(line) && !STEP_RE.test(line)) {
      i = skipBlockScalar(lines, i);
      continue;
    }
    const m = line.match(STEP_RE);
    if (!m) continue;
    const stepIndent = m[1].length;
    const step = {
      entity,
      line: i + 1,
      key: `- ${m[2]}: ${m[3]}`.trim(),
      contextLine: -1,
      contexts: null,
    };
    for (let k = i + 1; k < lines.length; k++) {
      const l = lines[k];
      if (l.trim() !== "" && indentOf(l) <= stepIndent) break;
      if (BLOCK_SCALAR_RE.test(l)) {
        k = skipBlockScalar(lines, k);
        continue;
      }
      const c = l.match(CONTEXT_RE);
      if (!c) continue;
      step.contextLine = k + 1;
      const raw = c[1].trim().replace(/\s+#.*$/, "");
      if (raw.startsWith("[")) {
        step.contexts = flowItems(raw);
      } else if (raw === "") {
        // A block sequence: `context:` then a deeper `- item` list.
        const items = [];
        for (let j = k + 1; j < lines.length; j++) {
          if (lines[j].trim() !== "" && indentOf(lines[j]) <= indentOf(l)) break;
          const it = lines[j].match(/^\s*-\s*(\S+)\s*$/);
          if (!it) break;
          items.push(it[1].replace(/^["']|["']$/g, ""));
        }
        step.contexts = items;
      } else {
        step.contexts = flowItems(`[${raw}]`);
      }
      break;
    }
    steps.push(step);
  }
  return steps;
}

/** The contract, in one place, so the gate and --self-test assert the SAME expectations. */
function findings(text) {
  const out = [];
  for (const s of parseTaskSteps(text)) {
    if (s.contexts === null || s.contexts.length === 0) {
      out.push({
        kind: "B",
        line: s.line,
        msg:
          `task \`${s.entity}\` — step \`${s.key}\` declares no \`context:\`; it would silently ` +
          `inherit the verb's VerbCatalog default instead of stating its own (an absent key and ` +
          `a zero-length list are the same fall-through: Go's \`len(op.Context) > 0\`), so the ` +
          `step's reachability would be decided somewhere other than this file`,
      });
      continue;
    }
    if (!s.contexts.some((c) => ACTIVE.includes(c))) {
      out.push({
        kind: "A",
        line: s.contextLine,
        msg:
          `task \`${s.entity}\` — step \`${s.key}\` declares context [${s.contexts.join(", ")}], ` +
          `disjoint from the active contexts [${ACTIVE.join(", ")}]: an EXPLICIT set overrides the ` +
          `verb's catalog default, so every grammar that consults it skips the step in BOTH modes ` +
          `(opencharly/opencharly#413)`,
      });
    }
  }
  return out;
}

const src = readFileSync(join(root, yamlRel), "utf8");
const run = (text) => findings(text);

function report(fs) {
  for (const f of fs) console.error(`  FAIL  ${yamlRel}:${f.line}: ${f.msg}`);
  return fs.length;
}

// ── --self-test: prove each assertion goes RED on a mutation of the shipped text ─────
if (argv.includes("--self-test")) {
  const steps = parseTaskSteps(src);
  let stFails = 0;

  const baseline = run(src);
  if (baseline.length) {
    report(baseline);
    console.error(`check-task-contexts --self-test: FAIL (the UNMUTATED ${yamlRel} is not green — fix the file first)`);
    process.exit(1);
  }
  console.log(`  PASS  the unmutated ${yamlRel} is GREEN — ${steps.length} step(s) over ${new Set(steps.map((s) => s.entity)).size} task(s), every one reachable`);

  // Each mutation reintroduces ONE defect class and names the assertion that must catch it.
  const M1_FROM = "          mode: status\n        context: [runtime]";
  const mutations = [
    [
      "the `map` step back to `context: [deploy]` (the #413 defect itself)",
      (s) => s.replace(M1_FROM, "          mode: status\n        context: [deploy]"),
      (fs) => fs.some((f) => f.kind === "A" && /task `map`/.test(f.msg)),
    ],
    [
      "the `skills` step's `context:` key DELETED (the step then states no context of its own — assertion B)",
      (s) =>
        s.replace(
          "        command: bash scripts/sync-dispatcher.sh\n        context: [runtime]",
          "        command: bash scripts/sync-dispatcher.sh",
        ),
      (fs) => fs.some((f) => f.kind === "B" && /task `skills`/.test(f.msg)),
    ],
    [
      "the `org-map` step's `context:` set emptied (`context: []`) — the zero-length-list fall-through",
      (s) => s.replace("          PY\n        context: [runtime]", "          PY\n        context: []"),
      (fs) => fs.some((f) => f.kind === "B" && /task `org-map`/.test(f.msg)),
    ],
    [
      "the `map` step's opener rewritten to an unlisted sugar word (`- frobnicate:`) with its `context:` dropped — the assertion that pins STEP_RE's BREADTH (a narrow opener regex reports the file GREEN with the step silently missing)",
      (s) =>
        s.replace(
          "      - run: print the submodule map\n        git-submodules:\n          mode: status\n        context: [runtime]",
          "      - frobnicate: print the submodule map\n        git-submodules:\n          mode: status",
        ),
      (fs) => fs.some((f) => f.kind === "B" && /task `map`/.test(f.msg)),
    ],
  ];
  for (const [name, mutate, caught] of mutations) {
    const mutated = mutate(src);
    if (mutated === src) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did not apply — the file no longer contains the text it targets`);
      continue;
    }
    if (caught(run(mutated))) {
      console.log(`  PASS  mutation '${name}' is caught`);
    } else {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' was NOT caught`);
    }
  }

  // A gate that flags EVERY change proves nothing: a reachable set must stay GREEN.
  const negative = src.replace(M1_FROM, "          mode: status\n        context: [build, deploy]");
  if (negative === src) {
    stFails += 1;
    console.error("  FAIL  negative control did not apply");
  } else if (run(negative).length !== 0) {
    stFails += 1;
    console.error("  FAIL  negative control: a reachable context set ([build, deploy]) must stay GREEN");
  } else {
    console.log("  PASS  negative control — a reachable set ([build, deploy]) stays GREEN");
  }

  if (stFails) {
    console.error(`check-task-contexts --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-task-contexts --self-test: OK (every assertion is live)");
  process.exit(0);
}

const n = report(run(src));
if (n) {
  console.error(`check-task-contexts: ${n} finding(s)`);
  process.exit(1);
}
console.log(`check-task-contexts: OK — every step of every task declares a context the plan runner activates`);
