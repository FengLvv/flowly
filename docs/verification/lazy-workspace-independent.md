# Lazy workspace (card workspace on first session): independent verification

Scope: card workspace provisioning moves from card save to the first session (`docs/LAZY-WORKSPACE-SPEC.md`). Verifier did not write or edit implementation code.

## Identity

- Verifier session ID: `b9b35704-c602-4a2e-beb8-4735d3ee64aa`.
- Initial candidate: `4241395d2c022a30188e71317180348fb71a2749` (`feat(workspaces): provision card workspace on first session`).
- Final candidate: `f6d7ef3a4afc2043f62450da15e276509f596d53` (`test(workspaces): check deferred provisioning in card creation flows`; test-only, changes `server/description-images.test.ts` and `server/ideas.test.ts`).
- Baseline: `a45f4f50f4c3983c30657619c90158fbd3703c56`.
- Worktrees were detached, verifier-owned, each with its own `npm ci` (exit 0). No `node_modules` links.
- Environment: `NODE_ENV=test FLOWLY_TELEMETRY=0 DO_NOT_TRACK=1`; `PASEO_HOME` set to a verifier-created private directory per tree; Vitest run with an explicit empty config (`export default {}`), not the shared `vitest.config.mjs`.

## Commands and results

| Check | Tree | Command | Exit | Result (pass / fail / skip) |
|---|---|---|---|---|
| Typecheck | `4241395` | `npm run typecheck` | 0 | pass |
| Typecheck | `f6d7ef3` | `npm run typecheck` | 0 | pass |
| Focused, 11 files (brief list), default 5 s timeout | `4241395` | vitest | 0 | 178 / 0 / 0 |
| Tool-server filter `-t 'first-session preparation'` | `4241395` | vitest | 0 | 1 / 0 / 12 |
| Focused, 13 files (brief list + `description-images` + `ideas`), 15 s timeout | `f6d7ef3` | vitest `--testTimeout=15000` | 0 | 208 / 0 / 0 |
| Tool-server filter | `f6d7ef3` | vitest | 0 | 1 / 0 / 12 |
| Full `npm test` equivalent, 15 s | `4241395` | vitest `--testTimeout=15000 --exclude docs/verification/** --exclude .claude/**` | 1 | 1362 / 37 / 7 (of 1406) |
| Full, 15 s, run 1 | baseline | same | 1 | 1356 / 34 / 7 (of 1397) |
| Full, 15 s, run 2 | baseline | same | 1 | 1358 / 32 / 7 (of 1397) |
| Full, 15 s | `f6d7ef3` | same | 1 | 1346 / 53 / 7 (of 1406) |
| Serial, 3 files, `--maxWorkers=1` | `f6d7ef3` | `agent-service`, `tool-server`, `auto-review` | 1 | 90 / 4 / 0 (of 94) |
| Serial, 3 files | baseline | same | 1 | 88 / 5 / 0 (of 93) |

Notes:
- `shared/attention.test.ts` (in the brief) does not exist in either tree; not run.
- My first focused run on `f6d7ef3` (11 fails) used Vitest's 5 s default because I omitted the project's `--testTimeout=15000`. Rerun with the project timeout: 208/208. That initial result was my harness error, not a code result.
- The baseline is not deterministic on this machine: two full runs gave 34 and 32 failures.

## Failure identity comparison (recomputed from raw JSON)

Raw data: `docs/verification/lazy-workspace-independent-failures.json` (failed assertions only, all four full runs).

Pairwise, by test identity (file + full name):

- `4241395` (37) vs baseline run 2 (32): shared 32. Only in candidate: 5 — 3 from the creation-timing assertions `f6d7ef3` updates (`description-images` create-once; `ideas` accepted and link-both-ways), plus `ideas` "duplicate open titles..." and `tool-server` "CLI runs a complete scoped flow...". Only in baseline: 0.
- `4241395` (37) vs baseline run 1 (34): shared 34. Only in candidate: 3 (the same creation-timing ones). Only in baseline: 0.
- `f6d7ef3` (53) vs baseline run 2 (32): shared 32. Only in `f6d7ef3`: 21. Only in baseline: 0.
- `f6d7ef3` (53) vs baseline run 1 (34): shared 33. Only in `f6d7ef3`: 20. Only in baseline: 1 (`ideas` "duplicate open titles...").
- Baseline run 1 vs run 2: shared 32. Only in run 1: `ideas` "duplicate open titles..." and `tool-server` "CLI runs a complete scoped flow...". This shows the baseline is itself flaky on those two.

Conclusion from the comparisons: no failure appears only on the baseline in a way that the candidate would hide, and every baseline failure also fails on `f6d7ef3`.

## Attribution of the 21 extra failures on `f6d7ef3` (full run)

- They sit in `agent-service`, `auto-review`, and `tool-server` (plus the 3 creation-timing ones in candidate `4241395`).
- Serial re-run of those three files on `f6d7ef3`: 4 failures, all of which also fail on the baseline serially (baseline 5). The candidate's 4 are a subset of the baseline's failures under serial load. The four are Windows environment assumptions:
  - temp-path casing (`C:\Users\vilolu\AppData\Local\Temp\fl…`);
  - file mode `438` vs `384` (POSIX permission bits);
  - git author/identity strings (`npm test @ SMITH`).
- The implementer-reported `agent-service` "outputs omission" and "gate pre-acknowledgement" failures did not reproduce in my serial run on `f6d7ef3`.
- **Not proven:** that the 21 full-run failures are only timeout/load effects. The serial re-run covers only the three hot files and does not cover the other files in the list (`sqlite-crash`, `error-report`, `local-daemon`, `linked-projects`, `session-images`, and others). Their identity is recorded in the JSON; their cause is unverified.

## Review findings (read-only, no code changed)

Reviewed `server/service.ts` (`ensureWorkspace`, `createTask` plans, availability check), `server/tool-server.ts` (`prepareSession`), `client/session.ts`, and native-call sites.

- No High finding in the provisioning path. `ensureWorkspace` is serialized through the shared per-store queue, is idempotent on retry (reuses the bound workspace), re-checks card/project/plan identity before binding, and refuses a second card binding to the same workspace.
- Low, not verified reachable: native calls that pass `task.workspaceId` without a guard — `server/review-session.ts:138`, `server/summaries.ts:286`, `server/session-insights.ts:213`. A pending card has no sessions, so they look unreachable before the first session; this was not proven. Left to the implementer, as the user directed.
- `server/store.ts:401` and `server/board-file.ts:41` use truthy checks, so the empty `workspaceId` of pending cards does not create false conflicts.

## External evidence (not produced by this verifier)

- GitHub Actions run `43876875930`: read-only check via the public API this session shows `status=completed`, `conclusion=success`, `head_sha=f6d7ef3a4afc2043f62450da15e276509f596d53`. Per-job results (Node 22/24 typecheck, full test, test:ci, package, CI gate) are reported by the implementer and were not re-read here; I did not verify them personally.
- This CI result is not a local result of the verifier and does not resolve the local Windows failures above.

## Not run

- Live UI scripts `docs/verification/lazy-workspace-live.mjs` and `lazy-auto-start-live.mjs`: not run (optional per brief; the implementer's live evidence is their own).
- Windows-specific failing tests were not investigated further (out of scope).
- `shared/attention.test.ts`: file does not exist.

## Cleanup receipt

- Verifier worktrees `.test-data/lazy-indep-3208f43b/candidate` and `.../baseline`: removed with `git worktree remove --force`; `git worktree list` shows no `lazy-indep` entries.
- Verifier `PASEO_HOME` directories (`home-candidate`, `home-baseline`): removed.
- Verifier raw logs, JSON reports, empty Vitest config, and the `.test-data/lazy-indep-3208f43b` directory itself: removed after the failure JSON was written. No `node_modules` links existed and none were removed.
- Retained in `docs/verification/` only: this report and `lazy-workspace-independent-failures.json`.
- Not touched: the implementer's `lazy-workspace-pr` worktree, other sessions' worktrees, the main checkout, and any other `.test-data` directory.
