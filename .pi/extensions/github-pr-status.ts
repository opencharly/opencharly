/**
 * github-pr-status.ts — the umbrella's GitHub PR + org-wide validation status
 * tool for pi agents.
 *
 * Why it exists: the org-wide `charly/pr-validator` GitHub Actions workflow
 * validates every PR, but its verdicts land on GitHub Actions, which has NO
 * path into a pi session. An agent that opens or fixes PRs therefore cannot
 * know whether its PR passed/failed without manually polling `gh` — the gap
 * that produced "I'll be woken as it concludes" being wrong.
 *
 * This tool closes it two ways:
 *   1. `check`  — one-shot status of a PR: state, head SHA, mergeable state,
 *                 the latest `charly/pr-validator` run ON THAT HEAD (not the
 *                 stale one), its conclusion, the failing step (Gate (BLOCK)
 *                 vs wait-for-ci), and the latest validator verdict comment.
 *   2. `watch`  — polls until the validator concludes on the CURRENT head (or
 *                 the PR merges/closes, or a timeout elapses), then returns
 *                 the full matrix. Run it inside a background child when the
 *                 harness supports one; its completion IS the wake.
 *
 * The tool wraps `gh` only (read-only queries; nothing is mutated).
 *
 * ## Four measured defects this file fixes (R1)
 *
 *   1. STATE CASING. `gh pr view --json state` returns UPPERCASE (`"OPEN"`), but the poll
 *      logic compared it to lowercase `"open"`. `"OPEN" !== "open"` therefore read as "this
 *      PR is no longer open" on EVERY poll, so `watch` returned after a single poll instead
 *      of waiting. Normalised once, in `getPR`.
 *   2. RUN LOOKUP. The run was found with `gh run list --workflow pr-validator.yml`, which
 *      does NOT resolve the org-required workflow (defined in `opencharly/.github`, it
 *      reports as `charly/pr-validator`) — measured: it listed unrelated heads while the
 *      real run existed on this head, so `check` reported "none found" even with a live
 *      run. Now queried by head SHA and matched on the run NAME.
 *   3. FAILING STEP. `gh run view <id> --json jobs` 404s on the org-required workflow (it
 *      resolves the run against the target repo) — same class as `gh run rerun`, which the
 *      git-workflow skill documents. The jobs are now read through the REST API.
 *   4. INCONCLUSIVE. A verdict-less `## validator INCONCLUSIVE` comment carries no
 *      `Verdict:` line, so the comment scan skipped it and reported `no-verdict-yet` (or an
 *      older PASS/BLOCK). It is now classified distinctly, and the tool says what to do
 *      (an environment/provider condition to fix or escalate — never a code finding).
 *   5. WATCH SHORT-CIRCUIT. `watch` returned on ANY concluded run (including a PASS) while
 *      its own loop kept polling after a PASS that arrived later — the two paths disagreed
 *      about the same state. `watch` now terminates on a FAILED run or a merged/closed PR
 *      only, so a PASS keeps polling until the merge lands (PASS != merged).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Type } from "typebox";

const execFileP = promisify(execFile);

/** Run gh with a JSON output and parse it; throw a readable error on failure. */
async function ghJson(args: string[]): Promise<any> {
  try {
    const { stdout } = await execFileP("gh", args, { maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (e: any) {
    const msg = e?.stderr?.toString?.() || e?.message || String(e);
    throw new Error(`gh ${args.join(" ")}: ${msg.slice(0, 300)}`);
  }
}

interface PRInfo {
  repo: string;
  number: number;
  state: string;
  headSha: string;
  mergeableState: string;
  title: string;
}

/**
 * The validator run on a head. `status` is `queued`/`in_progress`/`completed`; `conclusion`
 * is `null` until the run completes.
 */
interface RunInfo {
  databaseId: number;
  status: string;
  conclusion: string | null;
  headSha: string;
  attempt: number;
  name: string;
  startedAt: string;
}

/** The closed verdict vocabulary the tool reports. */
export type Verdict = "PASS" | "BLOCK" | "INCONCLUSIVE" | "no-verdict-yet" | "unknown";

async function getPR(repo: string, number: number): Promise<PRInfo> {
  const p = await ghJson(["pr", "view", String(number), "--repo", repo, "--json",
    "state,headRefOid,mergeStateStatus,title"]);
  return {
    repo,
    number,
    // `gh pr view --json state` returns UPPERCASE ("OPEN"); every comparison below is
    // lowercase, so normalise HERE. (Defect 1 — the casing mismatch made `watch` return
    // after one poll: "OPEN" !== "open" was read as "the PR is no longer open".)
    state: String(p.state ?? "").toLowerCase(),
    headSha: p.headRefOid,
    mergeableState: p.mergeStateStatus ?? "unknown",
    title: p.title ?? "",
  };
}

/**
 * The NEWEST `charly/pr-validator` run on a specific head SHA, or null.
 *
 * Queried by head SHA through the REST API and matched on the run NAME (defect 2):
 * `gh run list --workflow pr-validator.yml` does not resolve the org-required workflow.
 * `run_started_at` orders the candidates so a re-dispatch (a NEW run) wins over the run it
 * superseded — the same "newest same-name run" view the merge gate reads.
 */
async function validatorRunOnHead(repo: string, headSha: string): Promise<RunInfo | null> {
  const j = await ghJson(["api", `repos/${repo}/actions/runs?head_sha=${headSha}&per_page=100`]);
  const runs: any[] = Array.isArray(j?.workflow_runs) ? j.workflow_runs : [];
  const ours = runs.filter((r) => /pr-validator/i.test(String(r?.name ?? "")));
  if (ours.length === 0) return null;
  ours.sort((a, b) =>
    String(a.run_started_at ?? a.created_at ?? "").localeCompare(
      String(b.run_started_at ?? b.created_at ?? ""),
    ),
  );
  const r = ours[ours.length - 1];
  return {
    databaseId: r.id,
    status: String(r.status ?? ""),
    conclusion: r.conclusion ?? null,
    headSha: String(r.head_sha ?? ""),
    attempt: Number(r.run_attempt ?? 1),
    name: String(r.name ?? ""),
    startedAt: String(r.run_started_at ?? r.created_at ?? ""),
  };
}

/**
 * The failing step of a run, or "" if none. Read through the REST API (defect 3): `gh run
 * view` resolves the run against the TARGET repo and 404s on the org-required workflow,
 * exactly as `gh run rerun` does.
 */
async function failingStep(repo: string, runId: string): Promise<string> {
  try {
    const j = await ghJson(["api", `repos/${repo}/actions/runs/${runId}/jobs?per_page=100`]);
    const names = new Set<string>();
    for (const job of j?.jobs ?? []) {
      for (const step of job?.steps ?? []) {
        if (step.conclusion === "failure") names.add(step.name);
      }
    }
    return [...names].join(", ");
  } catch {
    return "";
  }
}

/** The latest validator verdict comment, classified (PASS | BLOCK | INCONCLUSIVE). */
async function latestVerdict(repo: string, number: number): Promise<Verdict> {
  try {
    // NO --jq here: ghJson does JSON.parse on stdout, and `--jq ".[].body"`
    // emits raw unquoted markdown (not valid JSON), which would always throw
    // and leave the verdict permanently "unknown". Fetch the JSON array and
    // scan the bodies in JS instead.
    // The issue-comments API returns ascending by default and IGNORES
    // direction=desc, so per_page=5 alone would fetch the OLDEST 5 comments
    // and scan backward through them — reporting a stale verdict. Fetch a full
    // page and scan the last 5.
    const comments = await ghJson(["api", `repos/${repo}/issues/${number}/comments?per_page=100`]);
    const texts: string[] = Array.isArray(comments) ? comments.map((c: any) => c.body ?? "") : [];
    for (let i = texts.length - 1; i >= Math.max(0, texts.length - 5); i--) {
      // A verdict-less run: the required check stays RED on purpose, but this is NOT a
      // finding about the diff (defect 4 — a `Verdict:`-only scan skipped it and reported
      // `no-verdict-yet`, or worse, an older PASS/BLOCK).
      if (/##\s*validator\s+INCONCLUSIVE/i.test(texts[i])) return "INCONCLUSIVE";
      const m = texts[i].match(/Verdict:\s*(PASS|BLOCK)/);
      if (m) return m[1] as Verdict;
    }
    return "no-verdict-yet";
  } catch {
    return "unknown";
  }
}

function formatCheck(pr: PRInfo, run: RunInfo | null, verdict: Verdict, failing: string): string {
  const lines = [
    `repo:        ${pr.repo}`,
    `PR:          #${pr.number} — ${pr.title}`,
    `state:       ${pr.state}`,
    `head:        ${pr.headSha.slice(0, 10)}`,
    `mergeable:   ${pr.mergeableState}`,
    `verdict:     ${verdict}`,
  ];
  if (run) {
    lines.push(`validator run: ${run.databaseId} @ ${run.headSha.slice(0, 10)} (attempt ${run.attempt})`);
    lines.push(`run status:   ${run.status}`);
    lines.push(`run concl:    ${run.conclusion ?? "in-progress"}`);
    if (run.conclusion === "failure") {
      lines.push(`failing step: ${failing || "(see run log)"}`);
      lines.push(
        `interpret:    ${
          verdict === "INCONCLUSIVE"
            ? "the gate ran but produced no verdict — an environment/provider condition, NOT a code finding; read the INCONCLUSIVE diagnostics and escalate (do not 'fix' the diff)"
            : failing.includes("Gate (BLOCK)")
              ? "pr-validator BLOCKED the PR — read the latest review comment and fix every finding"
              : failing.includes("Wait for the go gate")
                ? "the go gate did not conclude on the head within 19m — the go suite is slow or failed; check the ci.yml 'go' check"
                : failing.includes("gofmt")
                  ? "the go gate failed on gofmt — run gofmt -w on the changed files"
                  : "see the run log for the failing step"
        }`,
      );
    }
  } else {
    lines.push(`validator run: none found on the current head ${pr.headSha.slice(0, 10)} — either the run is still queued, or the head moved after the last review`);
  }
  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "gh_pr_status",
    label: "GitHub PR + Validation Status",
    description:
      "Check the status of a GitHub pull request and its org-wide `charly/pr-validator` run. " +
      "Use `mode: check` for a one-shot status (PR state, head SHA, mergeable state, the latest " +
      "validator run ON THE CURRENT HEAD, its conclusion, the failing step, and the latest " +
      "PASS/BLOCK/INCONCLUSIVE verdict). Use `mode: watch` to poll until the validator concludes " +
      "on the current head (or the PR merges/closes, or a timeout elapses) and return the full " +
      "matrix — run it in a background child when the harness supports one, so its completion wakes you.",
    promptSnippet: "Check a GitHub PR's state and its charly/pr-validator verdict",
    promptGuidelines: [
      "Use gh_pr_status check after opening or fixing a PR to verify the validator verdict and the failing step — the GitHub Actions validator does NOT wake the agent, so check explicitly.",
      "Use gh_pr_status watch when you need to wait for a validator conclusion — its completion is the wake (in pi, arm the watcher family instead; pi has no background-child wake).",
      "A 'Gate (BLOCK)' failing step means the pr-validator BLOCKED the PR — read the latest review comment and fix every finding before re-pushing.",
      "An INCONCLUSIVE verdict is NOT a code finding — it is a verdict-less run (a stale engine or a provider/endpoint condition); read its diagnostics and escalate rather than 'fixing' the diff.",
      "A 'Wait for the go gate' failing step means the validator never reviewed the head (CI wait timeout) — check the ci.yml 'go' check on the head; a gofmt failure there blocks the review.",
      "The validator verdict comment may be STALE (from an older head) — always compare the run's headSha with the PR's current headSha.",
    ],
    parameters: Type.Object({
      repo: Type.String({ description: "Repo in owner/name form, e.g. opencharly/charly" }),
      pr: Type.Number({ description: "Pull request number" }),
      mode: Type.Optional(StringEnum(["check", "watch"] as const), {
        description: "check = one-shot status (default); watch = poll until the validator concludes",
      }),
      timeoutSeconds: Type.Optional(Type.Number({ description: "Watch timeout in seconds (default 1800, max 3600)" })),
      intervalSeconds: Type.Optional(Type.Number({ description: "Watch poll interval in seconds (default 60)" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const repo = params.repo as string;
      const number = params.pr as number;
      const mode = (params.mode as string | undefined) ?? "check";

      const poll = async (): Promise<{ text: string; watchDone: boolean }> => {
        const pr = await getPR(repo, number);
        const run = await validatorRunOnHead(repo, pr.headSha);
        const verdict = await latestVerdict(repo, number);
        const fail = run?.conclusion === "failure" ? await failingStep(repo, String(run.databaseId)) : "";
        // watchDone: a FAILED validator run (BLOCK/INCONCLUSIVE) or a merged/closed PR is
        // terminal; a PASS on an OPEN PR is NOT — it keeps polling until the armed
        // auto-merge lands, because PASS != merged (#38). Defect 5: the former
        // `checkConcluded` flag short-circuited `watch` on a PASS as well, contradicting
        // the loop below (a PASS arriving LATER still polled), so the two paths disagreed
        // about the SAME state.
        const watchDone = pr.state !== "open" || run?.conclusion === "failure";
        return { text: formatCheck(pr, run, verdict, fail), watchDone };
      };

      const first = await poll();
      if (mode === "check" || first.watchDone) {
        return { content: [{ type: "text", text: first.text }], details: {} };
      }

      // watch: poll until watchDone (merge/close or a failed validator run) or timeout.
      const interval = (params.intervalSeconds as number | undefined) ?? 60;
      const timeout = Math.min((params.timeoutSeconds as number | undefined) ?? 1800, 3600);
      const deadline = Date.now() + timeout * 1000;
      let last = first.text;
      while (Date.now() < deadline) {
        if (signal?.aborted) {
          return { content: [{ type: "text", text: last + "\n\n(watch aborted)" }], details: {} };
        }
        await new Promise((r) => setTimeout(r, Math.min(interval, Math.max(1, deadline - Date.now())) * 1000));
        const snap = await poll();
        last = snap.text;
        if (snap.watchDone) {
          return { content: [{ type: "text", text: last + "\n\n(concluded)" }], details: {} };
        }
      }
      return {
        content: [{ type: "text", text: last + `\n\n(watch timed out after ${timeout}s — run again or check manually)` }],
        details: {},
      };
    },
  });
}
