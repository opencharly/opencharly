#!/usr/bin/env node
// check-task-command-vars.mjs — no `command:` step of any entity in THIS repo's
// charly.yml may carry a `${…}` reference in its text.
//
// "ENTITY", not "task": this repo's charly.yml declares entities of more than one kind —
// the tasks the `charly task` verb enumerates, and the check roster — and the gate counts
// every entity that carries a command step. Calling that count "task(s)" named a number
// that is not the task count, which is what made the README's own task count look
// contradicted; the noun now says what is counted, and the README carries no count that
// could contradict it.
//
// THE DEFECT THIS CLOSES (observed 2026-10-22, and introduced by this branch's own
// commit): the branch-audit step read its parallelism as
// `JOBS="${AUDIT_JOBS:-16}"`. The plan runner expands `${NAME}` in a command's text
// against the task's merged env — kit.ExpandOpVars (sdk/kit/checkvars_expand.go) rewrites
// every string inside the step's PluginInput, and a step's `command:` IS the generic
// plugin's `command` input, which the `command` verb hands to `sh -c`
// (plugin-command/candy/plugin-command/plugin.go). The key `AUDIT_JOBS:-16` resolved
// against nothing, so sdk/kit/planrun.go delivered the step as StatusSkip — and A SKIP IS
// NOT A FAILURE: `charly task verify` printed "0 failed" and exited 0 while the
// 431-call remote-branch audit never ran. The gate was GREEN over a check that did not
// happen, and the pre-push gate could not see it, because the fixture gate
// (scripts/check-verify-branch-audit.mjs) exercises the step's TEXT through
// spawnSync("/bin/sh", …) and therefore bypasses the plan runner entirely.
//
// WHY NO REFERENCE IS EVER OK IN THIS TEXT, even one that would resolve:
//   1. An UNRESOLVABLE one SKIPS the step (above). A skipped check is a green gate that
//      checked nothing.
//   2. A RESOLVABLE one is text-substituted into the SHELL'S SOURCE before the shell
//      parses it, so a task parameter's value becomes shell code (measured: a param
//      carrying `$(touch /tmp/marker)` created the marker). A value in a command's TEXT is
//      SOURCE; a value in the process ENVIRONMENT is DATA.
// So the only channel a command step has for an operator's value is the environment, and
// it is read with a BARE `$NAME` — the shell expands it at run time, out of the process
// environment, and the expander never sees it.
//
// ASSERTED — each proven LIVE by --self-test against a mutation of the shipped text
// (R2: the gate reads the shipped file):
//   V. No step's `command:` text contains a `${…}` reference.
//   B. COVERAGE: every `command:` key in the file is a step's OWN command — the channel
//      this rule governs. A `command:` key anywhere else (a plugin input field named
//      `command`, under a step's own inputs OR outside any plan step) would silently
//      escape the rule, so it is reported instead of ignored. A `command:` line inside
//      a block scalar's body is TEXT, not a key, and is not reported.
//   T. The PRINTED reference is the PRODUCT's own token (U+2026), never an ASCII
//      rendering of it: a PR body pastes this gate's output verbatim, and the org's
//      body linter refuses the AUTHOR's elision while allowing a program's own token
//      (opencharly/marketplace#537). Asserted against this file's OWN text, because
//      the printed token is this file's own text.
//
// NOT asserted, and why: whether a reference WOULD resolve. That needs the task's merged
// env at run time (its params, its vars and its env), which a static read of the file
// cannot know — and the whole point is that a command's text must not depend on it. The
// PRODUCT-side defects behind it are filed: the skip-not-fail behaviour of the plan
// runner in opencharly/charly#914, and the missing data channel from a task param into
// a command step's process environment in opencharly/plugin-task#34.
//
// Usage: node scripts/check-task-command-vars.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const yamlRel = "charly.yml";

/** The reference this gate forbids, as LITERAL text (a template literal would read
 *  `${…}` as an interpolation). Printed with the character the PRODUCT prints: this
 *  string is PRINTED, and a PR body pastes a gate's output verbatim, and the org's
 *  PR-body linter refuses the AUTHOR's elision of the evidence - an elided command
 *  line, an elided `head` command's output, a dropped line - while a program's OWN
 *  token is ALLOWED (opencharly/marketplace#537). This string is the program's, so the
 *  linter is right to allow it, and the ASCII rendering it used to need is deleted. */
const REF = "${…}";

/** The line this gate prints when it is clean. ONE owner for the printed text (R2), so
 *  the self-test can assert the SAME string the main path prints. */
const okLine = () => `check-task-command-vars: OK — no command step's text carries a ${REF} reference`;

const STEP_RE = /^(\s*)-\s+([A-Za-z0-9_.-]+):\s*(.*)$/;
const BLOCK_SCALAR_RE = /:\s*[|>][-+0-9]*\s*$/;
const indentOf = (l) => l.match(/^\s*/)[0].length;

/**
 * Every `command:` key in the file, with the step it belongs to — and, for a step's own
 * command, the TEXT the plan runner would execute.
 *
 * The shape this reads is the plan grammar's own: a `plan:` holds list items, each list
 * item is a step, and a step's keys sit two columns in. A `command:` key at exactly that
 * depth is the step's own command (the generic `command` verb, whose text the plan runner
 * expands and the shell then parses). A `command:` key at any OTHER depth — under a
 * plugin's own inputs, or OUTSIDE any plan step at all — is a plugin input field: DATA,
 * not source. It is REPORTED as uncovered rather than silently escaped (assertion B).
 *
 * TWO THINGS THIS SCAN MUST GET RIGHT, and both are asserted live by --self-test:
 *   1. EVERY `command:` key is looked at, wherever it sits. A key outside a plan step
 *      is a key like any other (a `defaults:` block may carry one), and skipping it
 *      would leave a hole in the very coverage assertion B claims.
 *   2. A `command:` line inside a BLOCK SCALAR'S BODY is a word in a sentence, not a
 *      key: `run: |` bodies are free text. So the scan tracks every block body and
 *      reads its lines as text.
 */
function parseCommandSteps(src) {
  const lines = src.split("\n");
  const steps = [];
  const uncovered = [];
  let entity = null;
  let inPlan = false;
  let planIndent = -1;
  let step = null;
  // Inside a block scalar's body: the lines are TEXT, never keys.
  let inBlock = false;
  let blockIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    const ind = indentOf(line);

    if (inBlock) {
      if (t === "" || ind > blockIndent) continue; // still the body
      inBlock = false; // the body ended; this line is a key again
    }
    if (t === "" || t.startsWith("#")) continue;

    // A `command:` KEY is looked at FIRST, at any depth — including a depth where
    // no step is open. It is the one key this gate governs, so it must never be
    // reachable only through the step machinery.
    const cmd = line.match(/^(\s*)command:\s*(.*)$/);
    if (cmd) {
      const keyIndent = cmd[1].length;
      const keyLine = i + 1;
      const inline = cmd[2].trim();
      const isBlock = inline === "" || /^[|>][-+0-9]*$/.test(inline);
      const owner = step;
      const isStepOwn = owner !== null && inPlan && keyIndent === owner.indent + 2;

      if (!isStepOwn) {
        uncovered.push({ line: keyLine, indent: keyIndent, entity, step: owner });
        if (isBlock) {
          inBlock = true;
          blockIndent = keyIndent;
        }
        continue;
      }

      if (isBlock) {
        // A block scalar: the body is every following line indented deeper than the key.
        const body = [];
        let k = i + 1;
        for (; k < lines.length; k++) {
          const l2 = lines[k];
          if (l2.trim() !== "" && indentOf(l2) <= keyIndent) break;
          body.push(l2.trim() === "" ? "" : l2.slice(keyIndent + 2));
        }
        i = k - 1;
        owner.cmd = body.join("\n");
        owner.cmdLine = keyLine;
        owner.cmdBodyStart = keyLine + 1;
      } else {
        owner.cmd = inline;
        owner.cmdLine = keyLine;
        owner.cmdBodyStart = -1;
      }
      continue;
    }

    if (ind === 0) {
      const e = line.match(/^([A-Za-z0-9_.-]+):/);
      entity = e ? e[1] : null;
      inPlan = false;
      planIndent = -1;
      step = null;
      if (BLOCK_SCALAR_RE.test(line)) {
        inBlock = true;
        blockIndent = ind;
      }
      continue;
    }
    if (!inPlan) {
      if (t === "plan:") {
        inPlan = true;
        planIndent = ind;
      } else if (BLOCK_SCALAR_RE.test(line)) {
        // Another key's block body: arbitrary text, never keys.
        let k = i + 1;
        while (k < lines.length && (lines[k].trim() === "" || indentOf(lines[k]) > ind)) k++;
        i = k - 1;
      }
      continue;
    }
    if (ind <= planIndent) {
      inPlan = false;
      step = null;
      continue;
    }

    const opener = line.match(STEP_RE);
    if (opener) {
      step = {
        entity,
        line: i + 1,
        key: `- ${opener[2]}: ${opener[3]}`.trim(),
        indent: opener[1].length,
        cmdLine: -1,
        cmd: null,
      };
      steps.push(step);
      continue;
    }
    if (!step) continue;
    if (ind <= step.indent) {
      step = null;
      continue;
    }
    if (BLOCK_SCALAR_RE.test(line)) {
      // Another key's block body: arbitrary text, never keys.
      let k = i + 1;
      while (k < lines.length && (lines[k].trim() === "" || indentOf(lines[k]) > ind)) k++;
      i = k - 1;
    }
  }
  return { steps, uncovered };
}

/** The contract, in one place, so the gate and --self-test assert the SAME expectations. */
function findings(text) {
  const { steps, uncovered } = parseCommandSteps(text);
  const out = [];

  for (const s of steps) {
    if (s.cmd === null) continue;
    const at = s.cmd.indexOf("${");
    if (at === -1) continue;
    // Locate the reference's line inside the file, so the finding points at it.
    let line = s.cmdLine;
    if (s.cmdBodyStart !== -1) {
      const before = s.cmd.slice(0, at).split("\n").length - 1;
      line = s.cmdBodyStart + before;
    }
    const snippet = s.cmd.split("\n")[at === -1 ? 0 : s.cmd.slice(0, at).split("\n").length - 1].trim();
    out.push({
      kind: "V",
      line,
      msg:
        `entity \`${s.entity}\` — step \`${s.key}\` has a \`${REF}\` reference in its command text: ` +
        `\`${snippet}\`. The plan runner CLAIMS it (kit.ExpandOpVars) and expands it against the ` +
        `task's merged env, so an unresolvable one does not fail the step — it SKIPS it, and the ` +
        `gate reads green while the check never ran; a resolvable one is substituted into the ` +
        `shell's SOURCE, so a parameter's value becomes shell code. Read the environment with a ` +
        `bare $NAME instead — the shell expands that at run time and the expander never sees it`,
    });
  }

  for (const u of uncovered) {
    const where = u.step
      ? `entity \`${u.step.entity}\` — step \`${u.step.key}\``
      : `${u.entity ? `entity \`${u.entity}\`` : "the file"}`;
    const detail = u.step
      ? `carries a \`command:\` key at indent ${u.indent}, which is NOT the step's own command (a step's keys sit two columns in, at ${u.step.indent + 2})`
      : `carries a \`command:\` key at indent ${u.indent}, OUTSIDE any plan step`;
    out.push({
      kind: "B",
      line: u.line,
      msg:
        `${where} ${detail}. This rule governs a step's own command text; a \`command:\` key ` +
        `elsewhere is a plugin input field and is NOT covered by it — assert it here, or move it`,
    });
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
  const { steps } = parseCommandSteps(src);
  const withCmd = steps.filter((s) => s.cmd !== null);
  let stFails = 0;

  const baseline = run(src);
  if (baseline.length) {
    report(baseline);
    console.error(`check-task-command-vars --self-test: FAIL (the UNMUTATED ${yamlRel} is not green — fix the file first)`);
    process.exit(1);
  }
  console.log(`  PASS  the unmutated ${yamlRel} is GREEN — ${withCmd.length} command step(s) over ${new Set(steps.map((s) => s.entity)).size} entit(y|ies), none carries a \`${REF}\` reference`);

  // Each mutation reintroduces ONE defect class and names the assertion that must catch it.
  const mutations = [
    [
      "the branch-audit step reads its parallelism with a braced reference — THE DEFECT THIS GATE EXISTS FOR (the step was SKIPPED, and the gate read green while it never ran)",
      (s) => s.replace('          JOBS="$(printenv AUDIT_JOBS 2>/dev/null || true)"', '          JOBS="${AUDIT_JOBS:-16}"'),
      "V",
    ],
    [
      "an INLINE command carries a braced reference (the rule covers the inline form too, not only the block scalar)",
      (s) => s.replace("command: node scripts/check-verify-submodules.mjs", "command: node ${GATE}.mjs"),
      "V",
    ],
    [
      "a `command:` key appears where it is NOT a step's own command (a plugin input field) — the rule's coverage is asserted, not assumed",
      (s) => s.replace("        git-submodules:\n          mode: status\n", "        git-submodules:\n          mode: status\n          command: echo hi\n"),
      "B",
    ],
    [
      "a `command:` key appears OUTSIDE any plan step (a `defaults:` block's own input) — the rule's coverage is not bounded by the plan",
      (s) => s.replace("    keep_images: 3\n", "    keep_images: 3\n    command: echo hi\n"),
      "B",
    ],
  ];
  for (const [name, mutate, kind] of mutations) {
    const mutated = mutate(src);
    if (mutated === src) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did not apply — the file no longer contains the text it targets`);
      continue;
    }
    if (run(mutated).some((f) => f.kind === kind)) {
      console.log(`  PASS  mutation '${name}' is caught by assertion ${kind}`);
    } else {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' was NOT caught by assertion ${kind}`);
    }
  }

  // A gate that flags EVERY change proves nothing: a bare `$NAME` read of the
  // environment must stay GREEN — it is the sanctioned way to take a value.
  const negative = src.replace('JOBS="$(printenv AUDIT_JOBS 2>/dev/null || true)"', 'JOBS="$AUDIT_JOBS"');
  if (negative === src) {
    stFails += 1;
    console.error("  FAIL  negative control did not apply");
  } else if (run(negative).length !== 0) {
    stFails += 1;
    console.error("  FAIL  negative control: a brace-free $NAME read must stay GREEN");
  } else {
    console.log("  PASS  negative control — a brace-free $NAME read stays GREEN");
  }

  // T. The PRINTED token is the PRODUCT's own token (U+2026). The printed text is THIS
  //    FILE's own text, so the assertion reads this file — and a mutation of it turns the
  //    assertion RED. (The ASCII rendering is spelled here in PIECES, never as a literal:
  //    the R5 sweep greps for that literal, and the gate must not defeat its own sweep.)
  const SELF = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const TOKEN = "…";
  const printedRefOf = (src) => (src.match(/^const REF = "(.*)";$/m) || [null, null])[1];
  if (!okLine().includes(TOKEN)) {
    stFails += 1;
    console.error("  FAIL  the printed reference is not the product's own token (U+2026)");
  } else {
    console.log("  PASS  the PRINTED reference is the product's own token (U+2026), not an ASCII rendering of it");
  }
  const mutatedSelf = SELF.replace(/^const REF = ".*";$/m, 'const REF = "${x}";');
  if (mutatedSelf === SELF) {
    stFails += 1;
    console.error("  FAIL  the printed-token mutation did not apply — this file no longer declares `const REF = \"…\";`");
  } else if (String(printedRefOf(mutatedSelf)).includes(TOKEN)) {
    stFails += 1;
    console.error("  FAIL  the printed-token assertion did NOT catch a reference that is not the product's own token");
  } else {
    console.log("  PASS  mutation 'the printed reference is not the product's own token — the claim this change makes' is caught by assertion T");
  }

  if (stFails) {
    console.error(`check-task-command-vars --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-task-command-vars --self-test: OK (every assertion is live)");
  process.exit(0);
}

const n = report(run(src));
if (n) {
  console.error(`check-task-command-vars: ${n} finding(s)`);
  process.exit(1);
}
console.log(okLine());
