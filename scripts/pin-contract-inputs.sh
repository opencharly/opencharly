#!/usr/bin/env bash
# pin-contract-inputs.sh — the pin contract's COMMIT-CARRIED INPUTS: ONE definition.
#
# `charly task pin-check` composes `verb:git-submodules` in mode: verify, and that
# verb READS three commit-carried inputs (opencharly/opencharly#661):
#
#   1. the INDEX's gitlinks — the edge's `got` side, and every submodule's recorded
#      gitlink (the checkout audit's expectation);
#   2. the MANIFEST that DECLARES the pin contract — charly.yml's `pins:` block, with
#      its `pin_map` and `pinned_from`;
#   3. the DECLARED PATH SET — .gitmodules, which the checkout audit walks.
#
# A diff that touches NONE of them cannot violate the check, whatever the diff is.
#
# TWO decisions ask that question, and they must answer it the same way:
#
#   - the commit gate's CHANGE CLASS (hooks/pre-commit-gate.sh): the check runs only
#     when the staged diff touches one of these inputs;
#   - the wave body's COVERAGE DECISION (scripts/sync-pin-evidence.sh): the check is
#     this diff's coverage only when the diff touches one of these inputs.
#
# A second, narrower copy of that rule is how the shipped class came to be wrong: it
# was derived by judgement ("a diff that moves a gitlink") instead of from what the
# verb reads, and a commit that edited the manifest or the path set moved no gitlink
# and therefore skipped the check that would have caught it. One definition, two
# readers — the rule cannot drift between them.
#
# Sourced, not executed: it defines the list and the two tests, and runs nothing.

# The DECLARATION files: the manifest that declares the pin contract, and the
# declared path set the checkout audit walks. A diff that edits either changes what
# the check compares, so either is in the class.
PIN_CONTRACT_DECLARATION_FILES=(charly.yml .gitmodules)

# pin_contract_is_declaration_input <path> — is this path one of the declaration
# files? Exits 0 for a declaration file, 1 for anything else.
pin_contract_is_declaration_input() {
  local path="$1" f
  for f in "${PIN_CONTRACT_DECLARATION_FILES[@]}"; do
    if [ "$path" = "$f" ]; then
      return 0
    fi
  done
  return 1
}

# pin_contract_touches_input <changed-paths> <gitlink-paths> — does this diff touch a
# commit-carried input of the pin check? Both arguments are NEWLINE-SEPARATED path
# lists: the diff's changed paths, and the subset of them that are gitlinks. The
# gitlink list is the caller's own measure (the commit gate reads it from the staged
# diff, the wave body from the moved path list), because a gitlink is a MODE, not a
# name: it is what a path's index entry says, not what the path is called.
#
# Exits 0 when the diff touches a commit-carried input, 1 when it touches none.
pin_contract_touches_input() {
  local changed="$1" gitlinks="$2" path
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if pin_contract_is_declaration_input "$path"; then
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
