# Session parity: independent verification (60f3220)

- Exact commit under test: 60f32208f285f1fa0a3e00d504838f6b7f9dc81e (feat(sessions): add model and provider controls)
- Parent baseline: a45f4f50f4c3983c30657619c90158fbd3703c56
- Test session: 323181c4-229a-42d2-baaa-232966545650 (PASEO_AGENT_ID of the verifier; permission mode bypassPermissions/full access)
- Checkout: detached worktree .test-data/session-parity-independent-60f3220 (removed after the run; this report copied out to .test-data/session-parity-independent-report.md)
- Environment: NODE_ENV=test, FLOWLY_TELEMETRY=0, PASEO_HOME = empty directory inside the worktree (isolated-paseo-home). Node v24.13.0, npm 11.6.2. `npm ci` with dev dependencies, exit 0.

## Commands and results

| Command | Exit | Counts |
|---|---|---|
| npm run typecheck | 0 | tsc --noEmit clean |
| npm test -- (8 focused files) | 1 | 163 passed, 4 failed, 167 total (all 4 in server/error-report.test.ts) |
| npm test (full, isolated PASEO_HOME) | 1 | 1413 total, 1378 passed, 28 failed, 7 pending, 18 failed suites |
| npm test (full, parent a45f4f5, isolated) | 1 | 1397 total, 1362 passed, 28 failed, 7 pending, 18 failed suites |

## Baseline comparison

Failing test set diff (isolated runs, by full test name):
- New in 60f3220 vs parent: none.
- Only in parent: none.
- The same 28 failures exist in the parent. They are platform/environment failures on Windows (for example linked-projects, local-daemon, project-folder, session-images, usage, skill-source). The commit does not add or fix any of them.
- The 4 focused error-report failures are among those 28 (present in parent too).

## Contamination found and recorded (not caused by 60f3220)

- My first full runs were unisolated (PASEO_HOME not set) and ran about 20:13-20:16 local. They produced 39 failures; 11 extra failures were state contamination, and the isolated rerun removed them.
- Those runs changed the real ~/.paseo: agents, plugin-data (flowly sqlite, guardrails, summaries, etc.) and projects/projects.json. The native registry gained temp `ultra-linked-*` projects. Four of them have createdAt inside my unisolated window: 2026-11-16T12:15:00.756Z prj_4c1c1e78c2eea4a5, 12:15:20.097Z prj_819d1feee0d329b2, 12:16:07.186Z prj_93bdc7ba5d5dd52d, 12:16:08.747Z prj_fd12228435c6b401 (paths under C:\Users\vilolu\AppData\Local\Temp\ultra-linked-*). Earlier ultra-linked-* entries (11:57 to 12:02) predate my run. Ownership of the four is probable but not proven, so none were deleted; the main session should decide, per the project-remove rules.
- Not run by me: docs/verification/session-parity-live.mjs, plugin install/reload, and any native project/workspace/card/session creation.

## Review (commit diff: shared/rpc.ts, server/session-settings.ts, client/session-settings.tsx)

Checked:
- RPC `configureSession`: strict zod input for modelId and feature; single-field refine both at RPC and in service.
- Server: per-agent in-process lock (`pending` Set); task/project archive check; the model and feature are checked against a fresh provider catalog or feature list; re-authorization immediately before the write (task, project, session workspace, provider, cwd, archive); write via the approved local-daemon adapter; connection closed in finally.
- Client: `locked` ref plus `operation.begin/end`; `onChanged` read-back in finally, so partial provider application is re-read.

Findings:
- No High finding confirmed by reading.
- Low/Medium (not verified by a test): in `client/session-settings.tsx`, `apply()`'s finally awaits `onChanged()`. If that read-back rejects, the rejection replaces the success/error toast path and escapes the handler. Not reproduced; no test covers it.
- Low: the server one-field check runs before `board`/task checks, so the RPC message is returned for any input shape; consistent, no issue.

## Unverified

- No UI or live session verification here (session-parity-live.mjs is owned by the main session).
- No Paseo daemon behavior of setAgentModel/setAgentFeature was exercised; only unit/service tests ran.
- Windows failures listed above were not fixed; they are pre-existing.
