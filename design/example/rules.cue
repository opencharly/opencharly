// rules.cue — the whole-document rules of DESIGN §5.4 whose "Design check" column says
// `rules.cue` (that column is the one list; design-consistency.sh checks this file emits exactly
// those rules). Run together with load.cue (it shares `doc`,
// `_node`, `_kindOf` and `_deployFieldSet`):
//
//   cue export DESIGN.cue design/example/load.cue design/example/rules.cue -l '"doc"' example.yaml -e violation
//
// It is the executable specification of those rules until core and the build plugin implement
// them. Reach: top-level nodes and the candies one level inside them; references are walked
// through up to three dotted segments; a namespaced reference is checked to its namespace.
package design

import (
	"list"
	"strings"
)

_ns: {for k, _ in *doc.import | {} {(k): true}}

// The kind a reference sees: "box" for a candy with `from:`.
_refKind: {for n, v in _node {(n): [if _kindOf[n] == "candy" for f, _ in v if f == "from" {"box"}, _kindOf[n]][0]}}

_candyFieldSet: {for f in _candyField {(f): true}}
_noContent: {description: _, from: _, require: _, platform: _, builder_box: _, entrypoint: _, tag: _}

// The candies of the document: top level, and one level inside top-level candies and local or
// android bodies — each with its path and value.
_candies: [
	for n, v in _node if _kindOf[n] == "candy" {{at: n, value: v}},
	for n, v in _node if _kindOf[n] == "candy" for k, x in v if _candyFieldSet[k] == _|_ {{at: "\(n).\(k)", value: x}},
	for n, v in _node for k, b in v if k == "local" || k == "android" for name, x in b
	if _deployFieldSet[name] == _|_ if [for t, _ in x if #KindNode[t] != _|_ {t}] == [] {{at: "\(n).\(name)", value: x}},
]

// ── references: {node, field, ref, want} — mirrors the @ref attributes of DESIGN.cue ──────
// Every clause iterates the fields that are present and never looks up one that may be absent.
_refs: [
	for n, v in _node if _kindOf[n] == "candy" for f, r in v if f == "from" {
		{node: n, field: "from", ref: r, want: ["source", "box", "pod", "vm"]}
	},
	for c in _candies for f, l in c.value if f == "require" for r in l {
		{node: c.at, field: "require", ref: r, want: ["candy"]}
	},
	for n, v in _node if _kindOf[n] == "candy" for f, m in v if f == "builder_box" for _, r in m {
		{node: n, field: "builder_box", ref: r, want: ["box"]}
	},
	for n, v in _node for k, b in v if k == "pod" || k == "vm" for f, r in b if f == "from" {
		{node: n, field: "\(k).from", ref: r, want: ["box", "source"]}
	},
	for n, v in _node for k, b in v if k == "local" || k == "android" for f, l in b if f == "require" for r in l {
		{node: n, field: "\(k).require", ref: r, want: ["candy"]}
	},
	for n, v in _node for k, b in v if k == "source" for f, r in b if f == "os" {
		{node: n, field: "source.os", ref: r, want: ["os"]}
	},
	for n, v in _node for k, b in v if k == "source" for f, o in b if f == "bootstrap" for g, r in o if g == "builder" {
		{node: n, field: "source.bootstrap.builder", ref: r, want: ["builder"]}
	},
	for n, v in _node for k, b in v if k == "os" for f, r in b if f == "container_init" || f == "system_init" {
		{node: n, field: "os.\(f)", ref: r, want: ["init"]}
	},
	for c in _candies for f, nd in c.value if f == "need" for t, m in nd if t == "harness" for a, _ in m {
		{node: c.at, field: "need.harness", ref: a, want: ["harness"]}
	},
]

// The project paths a dotted reference may name: top-level nodes, their inner nodes, and the
// nodes inside the bodies that have a nesting table (load.cue `_innerTable`), up to three segments.
_has: {
	for n, v in _node {
		(n): true
		if _kindOf[n] == "candy" for k, _ in v if _candyFieldSet[k] == _|_ {"\(n).\(k)": true}
		for k, b in v if _innerTable[k] != _|_ for name, x in b if _deployFieldSet[name] == _|_ {
			"\(n).\(name)": true
			for kk, bb in x if _innerTable[kk] != _|_ for name2, _ in bb if _deployFieldSet[name2] == _|_ {"\(n).\(name).\(name2)": true}
		}
	}
}

_check: [for x in _refs {
	let seg = strings.Split(x.ref, ".")
	x & {
		namespaced: _ns[seg[0]] != _|_
		found:      _has[x.ref] != _|_
		kind:       *"" | string
		if found && len(seg) == 1 {kind: _refKind[x.ref]}
	}
}]

violation: [
	// D-VAL-8: a candy has substance
	for c in _candies
	let substance = [for k, _ in c.value if k != "description" && k != "step" {k}]
	if len(substance) == 0 {
		{rule: "D-VAL-8", node: c.at, message: "has no substance: no content, no `from`, no `require` and no inner node"}
	},
	// D-VAL-1
	for c in _candies
	let own = [for k, _ in c.value if _noContent[k] == _|_ && k != "step" && _candyFieldSet[k] != _|_ {k}]
	let checks = [for f, l in c.value if f == "step" for st in l for k, _ in st if k == "check" {k}]
	if len(own) > 0 && len(checks) == 0 {
		{rule: "D-VAL-1", node: c.at, message: "has content of its own (\(strings.Join(own, ", "))) but no check: step"}
	},
	// D-VAL-2
	for x in _check if !x.namespaced && !x.found {
		{rule: "D-VAL-2", node: x.node, message: "\(x.field): \(x.ref) does not resolve to a node"}
	},
	for x in _check if !x.namespaced && x.found && x.kind != "" && !list.Contains(x.want, x.kind) {
		{rule: "D-VAL-2", node: x.node, message: "\(x.field): \(x.ref) is a \(x.kind), want \(strings.Join(x.want, " or "))"}
	},
	// D-VAL-4
	for a, _ in _ns if _node[a] != _|_ {
		{rule: "D-VAL-4", node: a, message: "namespace \(a) is also a top-level node name"}
	},
]
