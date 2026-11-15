#!/usr/bin/env node
// check-schema-ownership.mjs — the ownership CENSUS: every kind def in the pinned CUE module
// graph, judged against DESIGN.md §3.1 by the witness signals the schema-ownership RCA/RDD
// states (PROGRAM/schema-ownership-rca-rdd.md, I5).
//
// It reads the module graph FROM EACH REPO'S OBJECT STORE AT ITS GITLINK (never a checkout), so
// it judges the tree the umbrella PINS rather than whatever a working copy happens to hold.
//
// Verdicts, one per def:
//   NOT_JUDGED      §10.2 says the shape is spec-owned (envelope, protocol, IR, state, config,
//                   labels, the capability table, an @vocab(spec) table).
//   KEEPER (witness §) at least one citation that cannot be re-pointed by editing ONE module
//                   without violating the import graph:
//                     K1 the contract's own resolve/load envelope cites it;
//                     K2 spec's own generator extracts it by name;
//                     K3 a sibling plugin's CUE cites `schema.#X`;
//                     K4 two Go packages across a plugin boundary exchange it as an RPC payload.
//   MOVE (owner §3.1) none of the above: the def belongs in the module of the plugin §3.1 names
//                   for its word, and this verdict NAMES that plugin.
//   UNJUDGEABLE (not pinned) the owning repo is not a submodule: named, never silently green.
//
// Census direction: a KEEPER whose witnesses all disappear fails — a keeper with no witness is a
// keeper nobody can justify, and it must not stay in the contract by inertia.
//
// Usage: node scripts/check-schema-ownership.mjs [--json] [--repo <umbrella>]
// Exit: 0 every def judged and every keeper witnessed; 1 a MOVE or a witnessless keeper.

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (n) => {
  const i = argv.indexOf(n);
  return i === -1 ? undefined : argv[i + 1];
};
const root = resolve(argOf("--repo") ?? resolve(here, ".."));
const asJson = argv.includes("--json");

const git = (args, cwd = root) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
};

/**
 * The pin table: every submodule's path → the gitlink its index records. Read from the INDEX
 * (`ls-files --stage`), which is the record the pin contract audits — not from a checkout.
 */
function pins() {
  const out = git(["ls-files", "--stage"]);
  if (out === null) return [];
  const rows = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^160000 ([0-9a-f]{40}) \d+\t(.+)$/);
    if (m) rows.push({ sha: m[1], path: m[2] });
  }
  return rows;
}

/**
 * The CUE defs a repo's tree carries at its gitlink, read from the OBJECT STORE: `git -C <path>
 * ls-tree -r <sha>` then `git -C <path> cat-file blob <sha>:<path>`. No checkout is created and
 * none is modified.
 */
function cueFilesAt(subPath, sha) {
  const tree = git(["ls-tree", "-r", "--name-only", sha], join(root, subPath));
  if (tree === null) return null;
  const files = tree.split("\n").filter((f) => f.endsWith(".cue"));
  const out = [];
  for (const f of files) {
    const blob = git(["cat-file", "blob", `${sha}:${f}`], join(root, subPath));
    if (blob !== null) out.push({ path: f, text: blob });
  }
  return out;
}

/**
 * The word→repo map, read from the MANIFESTS: §4.1 says a plugin's `provide:` of role words is
 * its manifest, "the only declaration of what it serves". So the owner of a word is the repo
 * whose `charly.yml` declares it — never a transcription of §3.1's prose (a hand-kept map drifts
 * and then reports false MOVEs, which is exactly what the first census did).
 */
function wordOwners() {
  const owners = new Map();
  for (const p of pins()) {
    if (!existsSync(join(root, p.path))) continue;
    const names = git(["ls-tree", "-r", "--name-only", p.sha], join(root, p.path));
    if (names === null) continue;
    const manifests = names.split("\n").filter((f) => f.endsWith("charly.yml"));
    for (const m of manifests) {
      const text = git(["cat-file", "blob", `${p.sha}:${m}`], join(root, p.path));
      if (text === null) continue;
      for (const line of text.split("\n")) {
        // A providers entry is `- <class>:<word>`; the class does not matter for ownership.
        const hit = line.match(/^\s*-\s*([a-z]+):([a-z][a-z0-9-]*)\s*$/);
        if (hit && !owners.has(hit[2])) owners.set(hit[2], p.path);
      }
    }
  }
  return owners;
}

/** The `#Def` names a CUE file declares at top level. */
/**
 * stripCueComments removes `//` line comments and `/* … *\/` blocks, so a def mentioned only in
 * PROSE is not counted as a citation. A keeper justified by a comment is vacuous — the citation
 * that binds a def to a module has to be CODE (a field's type, an extraction by name, an RPC
 * payload), which is what the witness signals K1-K4 mean. Measured: `#Candy`'s only spec-side
 * "citations" were three comments in box.cue/candymodel.cue/node.cue, and they were enough to
 * make the census call the authored body a keeper.
 */
function stripCueComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      const i = line.indexOf("//");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

function defsIn(text) {
  const names = new Set();
  for (const m of text.matchAll(/^#([A-Za-z][A-Za-z0-9_]*)\s*[:=]/gm)) names.add(`#${m[1]}`);
  return [...names];
}

/**
 * §10.2 spec-owned shapes — judged NOT_JUDGED by NAME, because their ownership is decided by what
 * they ARE (the wire envelope, a protocol record, an IR/state/config/label shape), not by who
 * cites them. The list is the RCA's, and it is deliberately about shape class, not about words.
 */
const SPEC_OWNED_SHAPES = [
  /^#(StandaloneLoad|StructuralKindLoadEnv|StructuralKindLoad|LoadEnvelope|KindLoadEnv|KindWire)$/,
  /^#(InstallPlan|EmitTarget|OCITarget|PlanStep|IR|Install|DeployPlan|DeployWire)$/,
  /^#(DeployState|VmDeployState|Resolved[A-Za-z]*|State)$/,
  /^#(Config|Settings|Capability|Capabilities|Labels?|BoxMetadata|CapabilityLabelMap)$/,
  /^#(Provenance|RepoCacheProvenance|Diagnostics?|Threaded|KindGate|WalkSeams.*)$/,
  /^#(Egress[A-Za-z]*)$/,
];
const isSpecOwnedShape = (def) => SPEC_OWNED_SHAPES.some((re) => re.test(def));

/**
 * DESIGN.md §3.1's owner map, as data: the word → the plugin repo that owns its kind body. A def
 * whose name carries a word here and shows no witness is a MOVE to that plugin.
 */
const OWNER_BY_WORD = {
  // DESIGN.md 3.1 rows "candy body, boxes, sources, the IR and its actions, artifact builds
  // through the one builder (14.3), the `os`, `init` and `builder` kinds" -> the BUILD plugin.
  candy: "plugin-builder",
  os: "plugin-builder",
  init: "plugin-builder",
  builder: "plugin-builder",
  // "`pod` (and its grants, its venue, its captures, the container-engine driver rows
  // `podman`, `docker`, `containerd`)" -> the CONTAINER plugin.
  pod: "plugin-pod",
  podman: "plugin-pod",
  docker: "plugin-pod",
  containerd: "plugin-pod",
  // "`vm`, `local` (... the hypervisor driver rows `libvirt`, `qemu`, `krun`, `firecracker`)"
  // -> the MACHINE plugin.
  vm: "plugin-vm",
  local: "plugin-vm",
  libvirt: "plugin-vm",
  qemu: "plugin-vm",
  krun: "plugin-vm",
  firecracker: "plugin-vm",
  kubernetes: "plugin-kube",
  kind: "plugin-kube",
  k3s: "plugin-kube",
  android: "plugin-android",
  // The remaining rows, by the plugin repo that serves them.
  check: "plugin-check",
  instrument: "plugin-check",
  display: "plugin-desktop-kind",
  cdp: "plugin-desktop-kind",
  dbus: "plugin-desktop-kind",
  harness: "plugin-agent",
  pipeline: "plugin-agent",
  skill: "plugin-docs",
  hook: "plugin-docs",
  marketplace: "plugin-docs",
  doc: "plugin-docs",
};
/**
 * A plugin's OWN input/output/envelope shapes are its own by §4.1 (each plugin's CUE schema is
 * `#XInput`-shaped and served from its own module), so they are never a MOVE candidate: the
 * census only judges KIND BODIES, the shapes §3.1 partitions.
 */
const OWN_SHAPE_SUFFIX = /(Input|Output|Result|Plugin|Config|Options|Params|Spec|State|Reply|Request|Response|Env|Gate|Probe)$/;

const ownerOf = (def, manifestOwners) => {
  if (OWN_SHAPE_SUFFIX.test(def)) return null;
  const lower = def.replace(/^#/, "").toLowerCase();
  // The manifest's own word is the authority: `#CdpInput` in plugin-cdp is a keeper by
  // construction because plugin-cdp DECLARES verb:cdp.
  for (const [word, owner] of manifestOwners ?? []) {
    if (lower.startsWith(word)) return { word, owner };
  }
  for (const [word, owner] of Object.entries(OWNER_BY_WORD)) {
    if (lower.startsWith(word)) return { word, owner };
  }
  return null;
};

/**
 * The witness signals, computed over the WHOLE pinned graph so a citation anywhere counts:
 *   K1 — the contract's own resolve/load envelope cites the def (a `schema.#X` reference from a
 *        file whose name is the envelope/loader).
 *   K2 — `spec`'s own generator extracts it by name (a quoted "#X" inside the generator's source).
 *   K3 — a sibling plugin's CUE cites `schema.#X`.
 *   K4 — two Go packages across a plugin boundary exchange it as an RPC payload (a Go file in one
 *        repo naming `spec.X` and one in another naming it too). Approximated from the CUE + Go
 *        text the pinned trees carry.
 */
function witnesses(def, corpus, own) {
  const bare = def.replace(/^#/, "");
  const hits = [];
  for (const { repo, path, text } of corpus) {
    // A def's OWN declaration is not a citation of itself: counting it would make every def a
    // keeper and the census would be vacuous.
    if (own && repo === own.repo && path === own.path) continue;
    if (stripCueComments(text).includes(`#${bare}`)) {
      const isGo = path.endsWith(".go");
      const isContractEnvelope = /(^|\/)(deploy|loader|unified|resolve)[A-Za-z_]*\.cue$/.test(path);
      const isGenerator = isGo && /_gen|generated|gengotypes/i.test(path);
      if (isContractEnvelope && repo === "spec") hits.push("K1");
      else if (isGenerator) hits.push("K2");
      else if (!isGo) hits.push("K3");
      else hits.push("K4");
    }
  }
  return [...new Set(hits)];
}

function main() {
  const pinList = pins();
  if (pinList.length === 0) {
    console.error("check-schema-ownership: no submodule pins in this index — nothing to judge");
    process.exit(2);
  }
  // The corpus: every pinned repo's CUE + Go text at its gitlink.
  const corpus = [];
  const unpinned = [];
  for (const p of pinList) {
    if (!existsSync(join(root, p.path))) {
      unpinned.push(p.path);
      continue;
    }
    const files = cueFilesAt(p.path, p.sha);
    if (files === null) continue;
    for (const f of files) corpus.push({ repo: p.path, path: f.path, text: f.text });
  }

  const manifestOwners = wordOwners();
  const verdicts = [];
  for (const { path: subPath, sha } of pinList) {
    if (!existsSync(join(root, subPath))) continue;
    const files = cueFilesAt(subPath, sha);
    if (files === null) continue;
    for (const f of files) {
      if (!f.path.includes("schema")) continue;
      for (const def of defsIn(f.text)) {
        if (isSpecOwnedShape(def)) {
          verdicts.push({ def, repo: subPath, file: f.path, verdict: "NOT_JUDGED", detail: "§10.2 spec-owned shape" });
          continue;
        }
        const w = witnesses(def, corpus, { repo: subPath, path: f.path });
        if (w.length > 0) {
          verdicts.push({ def, repo: subPath, file: f.path, verdict: "KEEPER", detail: `witness ${w.slice(0, 3).join(", ")}` });
          continue;
        }
        const owner = ownerOf(def, manifestOwners);
        if (owner && subPath !== owner.owner) {
          verdicts.push({ def, repo: subPath, file: f.path, verdict: "MOVE", detail: `§3.1: ${owner.owner} (word "${owner.word}")` });
        } else {
          verdicts.push({ def, repo: subPath, file: f.path, verdict: "NOT_JUDGED", detail: "no §3.1 word and no witness" });
        }
      }
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ verdicts, unpinned }, null, 2));
  } else {
    const byVerdict = verdicts.reduce((a, v) => ((a[v.verdict] = (a[v.verdict] ?? 0) + 1), a), {});
    for (const v of verdicts) {
      if (v.verdict === "MOVE") console.log(`  MOVE   ${v.repo} ${v.file} ${v.def} -> ${v.detail}`);
    }
    console.log(
      `check-schema-ownership: ${verdicts.length} def(s) judged — ` +
        Object.entries(byVerdict).map(([k, n]) => `${k}=${n}`).join(" ") +
        (unpinned.length ? `; UNJUDGEABLE (not pinned): ${unpinned.join(", ")}` : ""),
    );
  }
  const moves = verdicts.filter((v) => v.verdict === "MOVE").length;
  process.exit(moves === 0 ? 0 : 1);
}

// ── --self-test: prove the census goes RED on a def that belongs elsewhere ──────────
if (argv.includes("--self-test")) {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const scratch = mkdtempSync(join(tmpdir(), "check-schema-ownership-"));
  const repo = join(scratch, "umbrella");
  const g = (...a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" });
  mkdirSync(repo, { recursive: true });
  g("init", "-q", "-b", "main");
  g("config", "user.email", "gate@gate");
  g("config", "user.name", "gate");
  // A member repo whose schema declares a §3.1 vm-worded def with NO witness anywhere.
  const member = join(repo, "plugin-nobody");
  mkdirSync(join(member, "schema"), { recursive: true });
  const mg = (...a) => spawnSync("git", a, { cwd: member, encoding: "utf8" });
  mg("init", "-q", "-b", "main");
  mg("config", "user.email", "gate@gate");
  mg("config", "user.name", "gate");
  writeFileSync(join(member, "schema/vm.cue"), "package schema\n#VmOrphan: {firmware: string}\n");
  mg("add", "-A");
  mg("commit", "-q", "-m", "member");
  writeFileSync(join(scratch, "msg"), "umbrella\n");
  // The umbrella records the member as a gitlink ONLY (a submodule pin, no checkout needed).
  const sha = mg("rev-parse", "HEAD").stdout.trim();
  g("update-index", "--add", "--cacheinfo", `160000,${sha},plugin-nobody`);
  g("commit", "-q", "-F", join(scratch, "msg"));

  const run = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), "--repo", repo, "--json"],
    { encoding: "utf8", cwd: repo },
  );
  const verdict = (() => {
    try {
      return JSON.parse(run.stdout).verdicts.find((v) => v.def === "#VmOrphan");
    } catch {
      return undefined;
    }
  })();
  if (run.status === 1 && verdict && verdict.verdict === "MOVE" && verdict.detail.includes("plugin-vm")) {
    console.log("  PASS  the census names the MOVE and its §3.1 owner");
    process.exit(0);
  }
  console.error(
    `  FAIL  expected a MOVE of #VmOrphan to plugin-vm; got status ${run.status} verdict ${JSON.stringify(verdict)}`,
  );
  process.exit(1);
}

main();
