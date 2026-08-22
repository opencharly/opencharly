export const meta = {
  name: 'triage-verify-failure',
  description:
    'Competing-hypotheses RCA of a FAILING pinning gate (AGENTS.md R1). Fans out N independent root-cause hypotheses for a failed `bash scripts/verify-pins.sh`, validates EACH on the live checkout, cross-checks them adversarially, converges on the surviving root cause, and returns a concrete fix to apply before re-running the gate. Read-mostly probing; never edits source or commits.',
  phases: [
    { title: 'Reproduce', detail: 'run the gate verbosely and capture the failing invariant' },
    { title: 'Hypothesize', detail: 'N independent root-cause theories, each gitlink-validated' },
    { title: 'Converge', detail: 'adversarial cross-check -> surviving root cause + fix' },
  ],
}

// Optional target invariant to triage (default: run the whole gate).
let rawArgs = args
if (typeof rawArgs === 'string') {
  const t = rawArgs.trim()
  if (t.startsWith('[') || t.startsWith('"')) {
    try {
      rawArgs = JSON.parse(t)
    } catch {
      rawArgs = t
    }
  } else {
    rawArgs = t
  }
}
let target = ''
if (Array.isArray(rawArgs)) target = rawArgs.map(String).map((s) => s.trim()).filter(Boolean)[0] || ''
else if (typeof rawArgs === 'string') target = rawArgs.trim().split(/\s+/)[0] || ''

const REPRO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    failingInvariant: { type: 'string', description: 'the exact FAIL: line from verify-pins.sh' },
    exitCode: { type: 'integer' },
    logTail: { type: 'string' },
    observed: { type: 'string', description: 'the concrete failure symptom' },
  },
  required: ['failingInvariant', 'observed'],
}

const HYPOTHESIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    theory: { type: 'string', description: 'the proposed root cause' },
    evidence: { type: 'string', description: 'what was checked live (git ls-remote, ls-tree, submodule status) and what it showed' },
    validated: { type: 'boolean', description: 'true only if probed against the live checkout' },
    proposedFix: { type: 'string' },
  },
  required: ['theory', 'evidence', 'validated'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    confirmed: { type: 'boolean', description: 'true if the theory survives the refutation attempt' },
    reasoning: { type: 'string' },
  },
  required: ['confirmed', 'reasoning'],
}

phase('Reproduce')
const repro = await agent(
  `You are a pinning-gate triager. The umbrella pinning gate "${target || 'bash scripts/verify-pins.sh'}" failed. ` +
  `Run it verbosely (bash -x scripts/verify-pins.sh) and read the FAIL: line. Report the failing invariant, exit code, ` +
  `the tail of the output, and the concrete observed symptom. Do NOT mutate anything, do NOT re-run fixes.`,
  { schema: REPRO_SCHEMA, label: 'reproduce-verify', phase: 'Reproduce' }
)

phase('Hypothesize')
const N = 4
const hyps = (await parallel(
  Array.from({ length: N }, (_unused, i) => () =>
    agent(
      `You are root-cause hypothesis #${i + 1} for the failing umbrella pinning gate. Symptom: ${repro && repro.observed ? repro.observed : '(see FAIL: line)'}. ` +
      `Form ONE independent root-cause theory DISTINCT from the obvious first guess (e.g. dirty submodule, wrong default branch, policy-B mismatch, dangling pin), then VALIDATE it against the LIVE checkout ` +
      `(git ls-remote --symref, git -C <submodule> status, git ls-tree HEAD vs git ls-files -s). Set validated=true only if you actually probed. ` +
      `Propose a concrete fix. Do NOT edit anything, do NOT commit.`,
      { schema: HYPOTHESIS_SCHEMA, label: `hyp${i + 1}:verify`, phase: 'Hypothesize' }
    )
  )
)).filter(Boolean)

phase('Converge')
const judged = (await parallel(
  hyps.map((h, i) => () =>
    agent(
      `Adversarially REFUTE this root-cause theory for the failing pinning gate: "${h.theory}". Evidence offered: ${h.evidence}. ` +
      `Try to disprove it using live probes (git ls-remote, git ls-tree, git submodule status). Default to confirmed=false if the theory is not backed by live evidence. ` +
      `Return confirmed=true ONLY if it genuinely survives refutation.`,
      { schema: VERDICT_SCHEMA, label: `judge${i + 1}:verify`, phase: 'Converge' }
    ).then((v) => ({ ...h, verdict: v }))
  )
)).filter(Boolean)

const survivors = judged.filter((h) => h.validated && h.verdict && h.verdict.confirmed)
log(`triage-verify-failure: ${hyps.length} hypotheses, ${survivors.length} survived adversarial cross-check.`)

return {
  target: target || 'verify-pins',
  reproduce,
  survivingRootCauses: survivors.map((h) => ({ theory: h.theory, evidence: h.evidence, proposedFix: h.proposedFix })),
  allHypotheses: judged,
  note: survivors.length
    ? 'Apply a surviving fix in the working tree, then re-run `bash scripts/verify-pins.sh` to confirm.'
    : 'No hypothesis survived live validation — gather more evidence before editing.',
}
