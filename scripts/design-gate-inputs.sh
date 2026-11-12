#!/usr/bin/env bash
# design-gate-inputs.sh — the DESIGN gate's COMMIT-CARRIED INPUTS: ONE definition.
#
# `bash scripts/design-check.sh` is seven controls over ONE tree (DESIGN.md A.2): the
# CUE toolchain, the DESIGN.md ↔ DESIGN.cue consistency, the examples and their
# negative cases, the capability ledger, every citation into a pinned module resolved
# at its pin, the schema patterns of every pinned plugin CUE module, and every pin's
# relation to a release tag. Each control reads a surface that a commit can change, and
# those surfaces are what this file names:
#
#   1. the NORMATIVE PAIR — DESIGN.md and DESIGN.cue, at the repository root (A.1,
#      A.4). The consistency control compares them; nothing else in the tree may
#      restate what they say.
#   2. the DESIGN TREE — design/: the parity and dulling ledgers and their admission
#      table (A.8), the example and negative fixtures (A.5), and the baselines the
#      gates record their known debt through (A.11, A.12, A.13).
#   3. the CONTROLS THEMSELVES — scripts/design-*.sh. A change to a control changes
#      what is enforced, so it is in the class by construction; a control that could
#      be edited without the gate re-reading it would let the gate be widened or
#      narrowed in the dark.
#   4. EVERY PINNED MODULE. The schema-pattern gate reads the CUE of the `spec` pin
#      and of every `plugin-*` pin, and the pin-tag control reads EVERY mode-160000
#      entry of the index (A.11, A.12). A gitlink is a MODE, not a name, so the
#      caller measures the gitlink paths and this file asks only whether one moved —
#      the same split scripts/pin-contract-inputs.sh uses, for the same reason.
#
# A diff that touches NONE of them cannot violate the gate, whatever the diff is.
#
# WHY THE CLASS IS THIS BROAD, AND WHY IT IS NOT WIDER. A gate that ran on every
# commit would be a wall between a contributor and their own work: `design-check.sh`
# is measured at 11m54s on the tree it was last run on (2026-11-09, before the citation
# control landed, 109 committed negative cases each spawning a `cue export`; re-measure
# before quoting the figure for the current gate), and ~42% of this repo's last
# 60 commits touch the design surface. A gate that ran on TOO LITTLE would read green
# over a tree it never looked at — the defect that made this file exist, because
# until it did, NOTHING in the tree ran `design-check.sh` at all. So the class is
# DERIVED FROM WHAT THE CONTROLS READ (the same discipline as
# scripts/pin-contract-inputs.sh, opencharly/opencharly#661) rather than from what a
# contributor would guess.
#
# ONE definition, ONE reader: hooks/pre-push runs the gate for a push whose commits
# touch one of these inputs, and scripts/check-design-gate.mjs fires that decision so
# a leg that stops running cannot pass unnoticed. A second, narrower copy of this
# rule is how the shipped class comes to be wrong.
#
# Sourced, not executed: it defines the list and the tests, and runs nothing.

# The NORMATIVE pair, at the root: DESIGN.md is the document, DESIGN.cue the single
# copy of the schema, and the consistency control exists to keep the two agreeing.
# TODO.md is read by the SAME control: every § reference must name a DESIGN.md section,
# every D- reference a DESIGN.md requirement, and every table row must carry its
# header's shape. So a TODO.md-only change is in the class too — without it, a
# TODO.md-only commit could break the consistency control unseen, which is exactly how
# the TODO-local §12.x references and a four-cell row reached `main` (the #992/#993
# rounds ran the pre-push gate's zero-design-inputs skip).
DESIGN_GATE_ROOT_FILES=(DESIGN.md DESIGN.cue TODO.md)

# The design tree: the ledgers, the fixtures, the censuses. A prefix, not a list —
# a new ledger or a new negative case is in the class the moment it is committed,
# with nothing to remember.
DESIGN_GATE_TREE_PREFIX="design/"

# The controls: every script that decides what the gate enforces.
DESIGN_GATE_CONTROL_PREFIX="scripts/design-"

# design_gate_is_root_file <path> — is this path one of the root inputs the controls read?
design_gate_is_root_file() {
  local path="$1" f
  for f in "${DESIGN_GATE_ROOT_FILES[@]}"; do
    if [ "$path" = "$f" ]; then
      return 0
    fi
  done
  return 1
}

# design_gate_is_in_class <path> — is this path — a FILE, not a gitlink — an input the
# design controls read?
design_gate_is_in_class() {
  local path="$1"
  case "$path" in
    "$DESIGN_GATE_TREE_PREFIX"*) return 0 ;;
    "$DESIGN_GATE_CONTROL_PREFIX"*) return 0 ;;
  esac
  design_gate_is_root_file "$path"
}

# design_gate_touches_input <changed-paths> <gitlink-paths> — do the commits this push
# publishes touch a commit-carried input of the design gate? Both arguments are
# NEWLINE-SEPARATED path lists: the commits' changed paths, and the subset of them
# that are gitlinks. The gitlink list is the caller's own measure, because a gitlink
# is what a path's index entry says (mode 160000), not what the path is called.
#
# Exits 0 when the push touches an input, 1 when it touches none.
design_gate_touches_input() {
  local changed="$1" gitlinks="$2" path
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if design_gate_is_in_class "$path"; then
      return 0
    fi
  done <<< "$changed"
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if printf '%s\n' "$changed" | grep -qxF -- "$path"; then
      return 0
    fi
  done <<< "$gitlinks"
  return 1
}
