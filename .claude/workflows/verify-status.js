export const meta = {
  name: 'verify-status',
  description:
    'Pinning-gate PLAN for the umbrella. Emits the exact commands that prove each README invariant (branch == real default, pins reachable + clean, policy B equality, charly nested submodules initialized) and what each proves. The umbrella gate is fast and local, so the PERSISTENT session can own the runs directly; this workflow only plans and never mutates.',
  phases: [
    { title: 'Discover', detail: 'confirm the gate script + submodule layout exist' },
    { title: 'Plan', detail: 'emit per-invariant command + assertion; run nothing' },
  ],
}

const DISCOVER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    targets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  required: ['targets'],
}

// The fixed invariant→command map. Each entry carries the README invariant it
// proves and where the verdict is read.
const INVARIANTS = [
  {
    id: 'defaults',
    invariant: 'every .gitmodules branch = the repo real default branch',
    cmd: 'bash scripts/verify-pins.sh',
    proves: 'git ls-remote --symref per submodule URL vs .gitmodules branch=',
  },
  {
    id: 'clean',
    invariant: 'every submodule is clean and checked out at its recorded gitlink',
    cmd: 'git submodule status',
    proves: 'no dirty markers; gitlink == checked-out HEAD',
  },
  {
    id: 'policy-b',
    invariant: 'policy B: sdk/spec/docs/distro-* pins == charly own gitlinks (plugins moved to the standalone marketplace repo)',
    cmd: 'bash scripts/verify-pins.sh',
    proves: 'ls-tree comparison charly/ vs umbrella/',
  },
  {
    id: 'nested',
    invariant: "charly's nested submodules initialized at their gitlinks",
    cmd: 'git -C charly submodule status --recursive',
    proves: 'no +/- prefixes (uninitialized / moved)',
  },
]

// Normalize requested invariants. Empty => all.
// `args` may arrive as an actual array (Workflow tool), a JSON-encoded string
// of that array (tool-call stringification), or a space-separated string
// (slash invocation). Decode JSON first, then normalize.
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
let requested = []
if (Array.isArray(rawArgs)) requested = rawArgs.map(String).map((s) => s.trim()).filter(Boolean)
else if (typeof rawArgs === 'string' && rawArgs.trim()) requested = rawArgs.trim().split(/\s+/)

let selected = INVARIANTS
if (requested.length) {
  const want = new Set(requested)
  selected = INVARIANTS.filter((e) => want.has(e.invariant) || want.has(e.id))
}

phase('Discover')
const discoverPrompt =
  `STRICTLY CONFIRM — never add, never substitute — that these umbrella gate targets exist: ` +
  `scripts/verify-pins.sh, scripts/sync-gitlinks.sh, and the .gitmodules file with at least 20 submodule entries. ` +
  `Return ONLY the entries that exist, verbatim, as JSON {targets:[{path}]}. Do NOT run anything.`
const discovered = await agent(discoverPrompt, { schema: DISCOVER_SCHEMA, label: 'discover-verify-targets', phase: 'Discover' })

phase('Plan')
const plan = selected.map((e) => ({
  invariant: e.invariant,
  cmd: e.cmd,
  proves: e.proves,
  ownedBy: 'persistent-session',
  verdict: 'exit 0 == PASS; any FAIL line names the broken invariant',
}))
for (const e of plan) log(`PLAN ${e.invariant}: ${e.cmd} — proves ${e.proves}`)

return {
  total: plan.length,
  planned: plan,
  ranHere: [],
  gateComplete: false,
  note: 'PLAN ONLY — run each planned[].cmd from the umbrella root; the verdict is exit 0 with the invariant printed.',
}
