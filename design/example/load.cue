// load.cue — stages 3 and 5 of DESIGN §4.1 for one document placed at `doc`, as D-LOAD-5
// specifies: every key-tagged choice is resolved by the tag keys the author wrote, and only the
// selected alternative is unified. design-examples.sh runs it as
//
//   cue vet -c DESIGN.cue design/example/load.cue -l '"doc"' example.yaml     (shape)
//   cue export … -e dispatch                                                  ("exactly one of" list)
//
// Dispatch reaches top-level nodes, their steps, and the inner and alongside nodes of their kind
// bodies; deeper nodes are unified through their parent's definition (CUE cannot recurse over
// data). The loader in core dispatches at every depth.
package design

import "strings"

doc: #Envelope

// The directives of a document; every other key is a node name (§4.2 rule 2).
#Envelope: {
	repo?:     #Repo
	plugin?:   {[#Name]: #RepositoryRef}
	import?:   {[#Name]: #RepositoryRef}
	discover?: [...#Text]
	[#TopName]: _
}

// ── nodes ───────────────────────────────────────────────────────────────────────
_node: {for n, v in doc if _directive[n] == _|_ {(n): v}}
_kindKeys: {for n, v in _node {(n): [for k, _ in v if #KindNode[k] != _|_ {k}]}}
// The kind of a top-level node: its kind key, or "candy" (the default entry of #NodeAlt).
_kindOf: {for n, ks in _kindKeys {(n): [for k in ks {k}, "candy"][0]}}

// ── inner and alongside nodes of a kind body (§12.2) ──────────────────────────────
_innerTable: {
	pod:        #InnerOfMachineAlt
	vm:         #InnerOfMachineAlt
	kubernetes: #InnerOfKubernetesAlt
	local:      #InnerOfLocalAlt
	android:    #InnerOfAndroidAlt
}
_deployFieldSet: {for f in _deployField {(f): true}}
_inner: [
	for n, v in _node for k, b in v if _innerTable[k] != _|_ for name, x in b if _deployFieldSet[name] == _|_ {
		let tbl = _innerTable[k]
		let tags = [for t, _ in tbl if t != "candy" for f, _ in x if f == t {t}]
		{
			at:    "\(n).\(name)"
			value: x
			if len(tags) == 1 {key: tags[0]}
			if len(tags) == 0 && tbl.candy != _|_ {key: "candy"}
			if len(tags) == 0 && tbl.candy == _|_ {
				error: "\(n).\(name): a \(k) admits inside it exactly one of: \(strings.Join([for t, _ in tbl {t}], ", "))"
			}
			if len(tags) > 1 {error: "\(n).\(name): exactly one kind key, found \(strings.Join(tags, ", "))"}
			table: tbl
		}
	},
]

// ── steps of top-level nodes and of their kind bodies ─────────────────────────────
_intentSet: {for w in _intentWord {(w): true}}
_verbSet: {for w in _verbWord {(w): true}}
_stepList: {for n, v in _node {
	(n): [
		for f, l in v if f == "step" for s in l {s},
		for k, b in v if #KindNode[k] != _|_ for f, l in b if f == "step" for s in l {s},
	]
}}
_stepKey: {for n, l in _stepList {(n): [for i, s in l {
	let intent = [for f, _ in s if _intentSet[f] != _|_ {f}]
	let verb = [for f, _ in s if _verbSet[f] != _|_ {f}]
	{
		index: i
		if len(intent) != 1 {error: "write exactly one intent of: \(strings.Join(_intentWord, ", "))"}
		if len(intent) == 1 && intent[0] == "check" && len(verb) != 1 {
			error: "a check carries exactly one verb of: \(strings.Join(_verbWord, ", "))"
		}
		if len(intent) == 1 && intent[0] == "run" && verb != ["command"] {
			error: "a run step carries only `command` (and its `guard`)"
		}
		if len(intent) == 1 && intent[0] != "check" && intent[0] != "run" && len(verb) != 0 {
			error: "an \(intent[0]) step carries no verb"
		}
		if len(intent) == 1 && intent[0] == "check" && len(verb) == 1 {key: "check \(verb[0])"}
		if len(intent) == 1 && intent[0] != "check" {key: intent[0]}
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
step: {for n, l in _stepKey {(n): [for k in l if k.error == _|_ {#StepAlt[k.key] & _stepList[n][k.index]}]}}
