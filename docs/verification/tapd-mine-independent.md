# TAPD "My to-dos" — independent verification, final SHA `e5f78964b1555856de0767ae5143ff62e27a4497`

**Result: FINAL. Typecheck passes. The focused suite and the full suite each fail only on identities that also fail on the baseline. No candidate-only failure.**

- Verifier session: `d27b4c40-3f57-406d-9601-e36ced0c3f21` (own Paseo agent, full access)
- Candidate (final): `e5f78964b1555856de0767ae5143ff62e27a4497`, checked out in a fresh detached temporary worktree. Differs from `3247efb` only in `server/connectors/tapd-mcp.ts` and `tapd-mcp.test.ts`.
- Baseline: `40a8f2e450334259c3b318163a249d55b827252f` (unchanged; failure identities from the earlier baseline run are reused for comparison).
- Environment: `NODE_ENV=test FLOWLY_TELEMETRY=0 DO_NOT_TRACK=1 PASEO_HOST=127.0.0.1:1`, `PASEO_HOME` set to a verifier-owned folder, `PASEO_CLI` and `FLOWLY_TAPD_LIVE` unset. No live TAPD read, no UI, no implementation change.

## Commands and results (final SHA)

| Check | Exit | Result |
|---|---|---|
| `npm run typecheck` | 0 | pass |
| Focused suite: `server/connectors/tapd.test.ts`, `tapd-mcp.test.ts`, `shared/tapd.test.ts`, `shared/connectors.test.ts`, `shared/i18n.test.ts`, `client/onboarding-logic.test.ts`, and the six adapter tests (azure, confluence, github, gitlab, jira, shortcut) | 1 | 12 files: 11 passed, 1 failed; 249 passed, 1 failed (250 total) |
| `npm test` (full, candidate) | 1 | 163 files: 146 passed, 15 failed, 2 skipped; 1436 passed, 24 failed, 8 skipped (1468 total) |

The one focused failure is `server/connectors/jira.test.ts` "saving tests the token; the stored file is private and the client never sees the secret". It is a Windows POSIX file-mode check (mode 438 vs expected 384) and fails the same way on the baseline.

## Failure comparison with baseline

- All 24 final-SHA failing identities also fail on the baseline. **No candidate-only failure.**
- The baseline fails 7 more identities that pass on the final SHA: `auto-review.test.ts` (linked root §6.3), `ideas.test.ts` (duplicate titles), four `memory.test.ts` tests, and the `tool-server.test.ts` CLI scoped flow. Earlier isolated reruns of ideas, memory and tool-server gave the same results on both trees, so I read these as run-order or environment variance, not as a TAPD change. I did not re-run them for this report.

## Invariants (code and spec, final candidate)

- Todo endpoints (`user_todo_stories/bugs/tasks_get`) are used only on the non-`all` recent and title search path. Explicit link, key and number lookups bypass the mine filter.
- `tapd-mcp.ts` uses `z.strictObject` for every tool, and `workspace_id` must match `^[1-9]\d{0,9}$`.
- Foreign-project todo rows are excluded. A todo without a project ID is an `EXTERNAL_INVALID` error.
- Title matching is case-insensitive and literal, applied before the 10/20 result limit.
- Errors propagate and never fall back to All.
- `all=true` keeps the project search.
- The client search cache key separates `mine` from `all` (`client/connectors.tsx`).
- The spec `docs/TAPD-CONNECTOR-SPEC.md` matches the code.

Not run: real TAPD reads (the parent ran the live read separately), UI and installed-plugin checks.

## Cleanup

- Removed my final-SHA worktree, its `node_modules` junction, the verifier `PASEO_HOME` folder and the verifier directory. A first removal was denied, but the worktree was already unregistered and its folder empty; I removed the empty folders.
- Earlier intermediate worktrees and junctions were removed in an earlier step, and one stray folder created by a mistaken command was also removed.
- `git worktree list` shows no verifier entries. The implementer's `tapd-mine-20261116/implementer` worktree belongs to another session and was not touched. Root `node_modules` still has 252 entries.

## Intermediate context (short)

Intermediate run on `3247efb`, superseded: 29 candidate failures vs 31 baseline. Candidate-only identities in that run (agent-service gate/reminders, tool-server CLI first refusal) also failed on the baseline in isolation, which is why the final comparison treats the failing set as environment-variant rather than as a regression.
