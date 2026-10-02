# Pi project config (`.pi/`)

Project-local configuration for [pi](https://pi.dev) agent sessions at the umbrella
root (`opencharly/opencharly`). Pi auto-loads `AGENTS.md` as context and loads the
OpenCharly skill corpus as a pi PACKAGE (`git:github.com/opencharly/marketplace` in
`settings.json`), installed automatically at startup after the project is trusted.
This directory also gives pi the one thing the other harnesses get from their own
plugin systems: a **hooks system**.

## What's here

| Path | Purpose |
|---|---|
| `settings.json` | Registers the project extensions and the project pi packages. |
| `extensions/` | Pi extensions — the git-workflow gate wiring (`charly-gates.ts`), the bed/PR status tools, and vision. |
| `APPEND_SYSTEM.md` | Umbrella context appended to pi's system prompt. |

## Gates

The `.pi/extensions/` gate extension is Pi's equivalent of the `.reasonix`/kimi
`PreToolUse(Bash)` wiring of `.claude/hooks/pre-commit-gate.sh` +
`.claude/hooks/pre-push-gate.sh`. It intercepts every `bash` tool call and blocks
commands the gates reject (force-push, direct push to `main`, `--no-verify` commit
bypass, untokenizable commits, new alias files). The gates guard mechanics only;
attribution, change class, CHANGELOG coverage, architecture and R0–R10 proof are
judged by the fresh `pr-validator` at merge, never by the extension.

## Trust

Pi asks before trusting a project that contains project-local resources (like this
`.pi/`). Trust it once with `/trust` (interactive) or `--approve`/`-a`
(non-interactive) so the extensions load.
