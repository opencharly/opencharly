---
description: Load skills matching the dispatcher trigger keywords
argument-hint: "<trigger1, trigger2, ...>"
---
# Load Skills: $@

1. Read the AGENTS.md skill dispatcher table to identify matching triggers
2. Call `umbrella_load_skills` with triggers: [$@]
3. Review the returned SKILL.md content before proceeding
4. If the task involves git/gitlink/pin operations, `umbrella_load_skills` automatically loads the git-workflow skill
