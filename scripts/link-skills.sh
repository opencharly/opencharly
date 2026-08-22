#!/usr/bin/env bash
# link-skills.sh — create the umbrella's .agents/skills symlink farm + profile.
#
# Skills live in the `plugins/` submodule (pinned by policy B to the same
# commits charly sees). This script materializes the subset the umbrella
# actually exercises — git-link/CI ops, agent discipline — as symlinks under
# .agents/skills/, plus the .charly-profile.json manifest (mirroring charly's
# own layout, so harnesses that read the profile work identically).
#
# Idempotent: re-running recreates exactly the declared set. The symlinks are
# read-only references INTO the submodule; they never write inside it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# <link-name> <plugin>/skills/<skill>
SKILLS=(
  "charly-internals--agents internals/skills/agents"
  "charly-internals--git-workflow internals/skills/git-workflow"
  "charly-internals--root-cause-analyzer internals/skills/root-cause-analyzer"
  "charly-internals--strict-policy internals/skills/strict-policy"
  "charly-automation--agent automation/skills/agent"
  "charly-automation--alias automation/skills/alias"
)

mkdir -p .agents/skills
: > .agents/skills/.charly-profile.json.tmp
{
  printf '{\n  "version": 1,\n  "links": {\n'
  first=1
  for entry in "${SKILLS[@]}"; do
    name="${entry%% *}"; target="${entry#* }"
    [ -d "plugins/$target" ] || { echo "link-skills: MISSING plugins/$target" >&2; exit 1; }
    ln -sfn "../../plugins/$target" ".agents/skills/$name"
    if [ "$first" -eq 1 ]; then first=0; else printf ',\n'; fi
    printf '    "%s": "../../plugins/%s"' "$name" "$target"
  done
  printf '\n  }\n}\n'
} > .agents/skills/.charly-profile.json.tmp

mv .agents/skills/.charly-profile.json.tmp .agents/skills/.charly-profile.json
echo "link-skills: linked ${#SKILLS[@]} skills, wrote .charly-profile.json"
