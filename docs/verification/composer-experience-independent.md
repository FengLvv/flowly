# Composer experience independent verification

- Candidate: `b9fa8ed33d297df1da3d6eef4be411ce85e7b284` (parent `dbb7a827cb96ea3c79820c894d165eee508a5e88`)
- Baseline: `ddfaa6dfafdac237797225cc63cc54626b9d5491`
- Verifier session: `08e117fa-11a0-47cc-ba56-17356cb478ce`; provider/model `codex/gpt-6-luna`; created with `settings.modeId: full-access`.
- No additional native Paseo sessions/resources were created during verification; tests used isolated local fixtures only.
- Mode: Windows PowerShell; detached temporary worktrees; `NODE_ENV=test`, `FLOWLY_TELEMETRY=0`; each run used an empty task-specific `PASEO_HOME` under `.test-data`.

## Candidate checks

| Command | Exit | Result |
|---|---:|---|
| `npm ci` | 0 | Completed; 368 packages installed. |
| `npm run typecheck` | 0 | Passed. |
| `npx vitest run client/attachment-draft.test.ts client/web-files.test.ts shared/composer-commands.test.ts server/session-files.test.ts server/composer.test.ts client/session-input.test.ts client/send-queue.test.ts client/onboarding-logic.test.ts shared/i18n.test.ts server/native-session.test.ts` | 0 | 10 files passed; 145 tests passed. |
| `npm test` | 0 | 180 files passed, 2 skipped; 1710 tests passed, 8 skipped. |

## Parent failure identity comparison

The `dbb7a82` full suite had exit 1: 6 files failed, 174 passed, 2 skipped; 11 tests failed, 1698 passed, 8 skipped. Failures were 10 timeouts and one `server/native-session.test.ts` send-mock argument assertion.

The parent comparison ran `npx vitest run server/agent-service.test.ts server/auto-review.test.ts server/ideas.test.ts server/native-session.test.ts server/tool-server.test.ts server/connectors/jira.test.ts` with the same environment; exit 1, 5 files failed / 1 passed, 29 failures / 125 passed. All 10 `dbb7a82` timeout identities reproduced on the parent. The `native-session` mock assertion passed on the parent and was specific to `dbb7a82`; it passes on `b9fa8ed`. The parent had 19 additional timeout identities in those files. No baseline failures are counted as candidate regressions.

## Source review

Read-only review of the frozen candidate's attachment draft controller, composer service, session preview and related schema found no additional confirmed High/Medium issue. Writes are scoped and revalidated before serialized mutation; file bytes are stored under server-generated UUID filenames and only files referenced by removed draft items are deleted. Pending reads remain owned by the per-session controller across preview unmount; `ready()` prevents send while collection or persistence is pending. The focused controller tests cover collection across unmount, reopen, failed writes/retry, remove and send acknowledgement/restore.

## Cleanup

- Removed only this verification's detached worktrees: `.test-data/composer-independent-20261117-1534` and `.test-data/composer-independent-parent-20261117-1534`.
- Removed only their empty task-specific homes: `.test-data/composer-independent-home-20261117-1534` and `.test-data/composer-independent-parent-home-20261117-1534`.
- Verified with `git worktree list --porcelain` that neither verification worktree remains. Existing worktrees and all shared main-worktree changes were preserved.
- No raw logs retained; failure identities and counts are recorded above.
