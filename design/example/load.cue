// load.cue — stages 3 and 5 of DESIGN §4.1 for one document placed at `doc`, as D-LOAD-5
// specifies: every key-tagged choice is resolved by the tag keys the author wrote, and only the
// selected alternative is unified. design-examples.sh runs it as
//
//   cue vet -c DESIGN.cue design/example/load.cue -l '"doc"' example.yaml     (shape)
//   cue export … -e dispatch                                                  ("exactly one of" list)
//
// Dispatch reaches top-level nodes, their steps, the inner nodes of their kind bodies, and the
// nodes beside a top-level node whose kind admits them; deeper nodes are unified through their
// parent's definition (CUE cannot recurse over data). The loader in core dispatches at every depth.
// Every placement table is read from the `_deploymentKind` rows (D-NEST-2); none is written here.
package design

import "strings"

// The envelope is checked beside the data: under language v0.18.0 a value selected from inside a
// definition keeps that definition's closedness, so each node is dispatched from the plain data.
doc:      _
envelope:  #Envelope & doc

// The directives of a document; every other key is a node name (§4.2 rule 2).
#Envelope: {
	repo?:     #Repo
	plugin?:   {[#Name]: #RepositoryRef}
	import?:   {[#Namespace]: #RepositoryRef} // D-KIND-4: the same guard the schema states
	discover?: [...#Text]
	[#TopName]: _
}

// ── nodes ───────────────────────────────────────────────────────────────────────
_directiveSet: {for w in _directiveWord {(w): true}}
_node: {for n, v in doc if _directiveSet[n] == _|_ {(n): v}}
_kindKeys: {for n, v in _node {(n): [for k, _ in v if #KindAlt[k] != _|_ {k}]}}
// The kind of a top-level node: its kind key, or "candy" (the default entry of #NodeAlt).
_kindOf: {for n, ks in _kindKeys {(n): [for k in ks {k}, "candy"][0]}}

// ── inner and beside nodes of a deployment body (§12.2), from the kind rows ──────
// What a body of kind k admits inside it, and what may stand beside a node of kind k.
_innerTable: {for k, r in _deploymentKind if len(r.admit) > 0 {(k): {for a in r.admit {(a): _#InnerNode[a]}}}}
_besideTable: {for k, r in _deploymentKind if len(r.beside) > 0 {(k): {for b in r.beside {(b): _#BesideNode[b]}}}}
_deployFieldSet: {for f in _deployField {(f): true}}
// Every placed node: inside a kind body, or beside a node whose kind admits nodes beside it.
// Only a mapping is dispatched; a scalar written where a node may stand is reported by the node itself.
_placed: [
	for n, v in _node for k, b in v if _innerTable[k] != _|_ for name, x in b if _deployFieldSet[name] == _|_ if (x & {...}) != _|_ {
		{at: "\(n).\(name)", where: "a \(k) admits inside it", table: _innerTable[k], value: x}
	},
	for n, v in _node for k, _ in v if _besideTable[k] != _|_ for name, x in v if name != k if (x & {...}) != _|_ {
		{at: "\(n).\(name)", where: "beside a \(k) stands", table: _besideTable[k], value: x}
	},
]
_inner: [
	for p in _placed {
		let tags = [for t, _ in p.table if t != "candy" for f, _ in p.value if f == t {t}]
		{
			at:    p.at
			value: p.value
			table: p.table
			if len(tags) == 1 {key: tags[0]}
			if len(tags) == 0 && p.table.candy != _|_ {key: "candy"}
			if len(tags) == 0 && p.table.candy == _|_ {
				error: "\(p.at): \(p.where) exactly one of: \(strings.Join([for t, _ in p.table {t}], ", "))"
			}
			if len(tags) > 1 {error: "\(p.at): exactly one kind key, found \(strings.Join(tags, ", "))"}
		}
	},
]

// ── steps of top-level nodes and of their kind bodies, dispatched by intent ───────
_intentSet: {for w in _intentWord {(w): true}}
_verbSet: {for w in _verbWord {(w): true}}
_stepList: {for n, v in _node {
	(n): [
		for f, l in v if f == "step" for s in l {s},
		for k, b in v if #KindAlt[k] != _|_ for f, l in b if f == "step" for s in l {s},
	]
}}
_stepKey: {for n, l in _stepList {(n): [for i, s in l {
	let intent = [for f, _ in s if _intentSet[f] != _|_ {f}]
	// a run step's own `command` field shares the word of the `command` verb
	let verbs = [for f, _ in s if _verbSet[f] != _|_ if !(f == "command" && intent == ["run"]) {f}]
	{
		index: i
		if len(intent) != 1 {error: "write exactly one intent of: \(strings.Join(_intentWord, ", "))"}
		if len(intent) == 1 && intent[0] == "check" && len(verbs) != 1 {
			error: "a check carries exactly one verb of: \(strings.Join(_verbWord, ", "))"
		}
		if len(intent) == 1 && intent[0] != "check" && len(verbs) != 0 {
			error: "the \(intent[0]) step carries no verb"
		}
		if len(intent) == 1 {key: intent[0]}
		if len(intent) == 1 && intent[0] == "check" && len(verbs) == 1 {verb: verbs[0]}
	}
}]}}

// ── results ───────────────────────────────────────────────────────────────────────
dispatch: [
	for n, ks in _kindKeys if len(ks) > 1 {"node \(n): exactly one kind key, found \(strings.Join(ks, ", "))"},
	for x in _inner if x.error != _|_ {x.error},
	for n, l in _stepKey for k in l if k.error != _|_ {"node \(n) step \(k.index): \(k.error)"},
]
node: {for n, v in _node if len(_kindKeys[n]) <= 1 {(n): #NodeAlt[_kindOf[n]] & v}}
inner: {for x in _inner if x.error == _|_ {(x.at): x.table[x.key] & x.value}}
// A check is unified with the one verb arm it names, never with the whole verb union (D-LOAD-5).
_#CheckWith: {for w, _ in #VerbAlt {(w): {#CheckFields..., #VerbAlt[w]...}}}
step: {for n, l in _stepKey {(n): [for k in l if k.error == _|_ {
	[if k.verb != _|_ {_#CheckWith[k.verb]}, #StepAlt[k.key]][0] & _stepList[n][k.index]
}]}}
