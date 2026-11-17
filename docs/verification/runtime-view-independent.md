# Runtime view — independent precommit verification

Card: 53970163-6ece-4ae5-b1e6-e0ddc0057baa
Session ID: ec771de7-c0db-43af-be4d-56b8a7d94b32
Tree under test: the shared **working tree** (uncommitted Runtime changes). HEAD ab25171 is parent metadata only; it does not contain these changes.
Exact-commit gate: **UNRUN**.
Environment: `NODE_ENV=test FLOWLY_TELEMETRY=0`, Windows 11.

## Round 1 (earlier tree)

- `npm run typecheck`: exit 0.
- Focused vitest, 25 files: exit 0, 244 passed.
- Finding 1 (Medium): mark-read rejected unavailable-provider native sessions on the Runtime path only (`server/session-reads.ts`, `writable=true` in `nativeSession`). Reported to the parent.
- Finding 2 (Low): sessions with no `workspaceId` are grouped as "Session state unavailable" (`shared/runtime-view.ts:24`). Needs a real-daemon check in the UI run.

## Round 2 (final recheck, after the parent's fixes)

| Command | Exit | Result |
|---|---|---|
| `npm run typecheck` | 0 | clean |
| `npx vitest run` on `client/focus-ring.test.ts` plus the 25 focused files from round 1 | 0 | 26 files, 245 tests passed, 0 failed |

- Finding 1 is fixed. `server/session-reads.ts:228` now calls `nativeSession(paseo, input)` without the writable flag and still rejects archived sessions (line 229). `server/native-session.test.ts` (around line 65) sets `providerUnavailable` and asserts that mark-unread and mark-read succeed, and that a moved workspace is rejected.
- Finding 2 is unchanged. It is a Low item for the UI run, not a code defect.
- No new High finding.

## Not run

- Exact-commit gate on a worktree of the commit that contains these changes: UNRUN.
- Full `npm test`: UNRUN (focused subset only; the full suite belongs to root).
- Desktop, compact and phone UI: UNRUN here (root UI run).
