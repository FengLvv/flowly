# Internal TAPD verification — 2026-11-13

Follow-up: the previously incomplete New task/Artifacts/actual-agent checks are now accepted; the screenshot helper's over-broad hiding caused the navigation failures and is fixed. Full runner 26/26, privacy regression 7/7, actual Haiku response `TAPD_READ_OK`, including expected cross-card refusal. See [follow-up acceptance](tapd-ui-followup.md) for current evidence and cleanup limits. Historical first-delivery results below are retained.

Implemented source: `7a93ef63c78f36f75fb32f833650f8134b795366`, branch `feat/tapd-inputs`, [PR #3](https://github.com/FengLvv/flowly/pull/3). The shared checkout remains on its original main branch; a private temporary Git index excluded the infinite-canvas plugin and other sessions' dirty files.

## Passed

- `npm run typecheck`: exit 0. Focused new/shared checks: six files, 170/170, exit 0. Connector regression: 229 passed, one existing Windows POSIX mode assertion failed. No assertion weakened.
- Opt-in `tapd.live.test.ts`: exit 0, 1/1; real internal MCP project membership, recent requirement/bug/task summaries, exact requirement body, comment endpoint (empty comments), and short-ID `ShardIdMap` mapping. Populated comments are covered by deterministic tests, not a live populated-comment example.
- Independent Haiku session `ea94a1a8-abc6-49a4-b71c-53811192711f` checked exact candidate and baseline archives: candidate 1411 passed / 29 failed / 8 skipped, baseline 1361 / 29 / 7. Failed identities are identical; 51 additional candidate cases have no failures. No high-risk finding. [Verifier-owned report](tapd-independent.md). Temporary checkouts removed; test session archived.
- Isolated installed-plugin RPC: **8/8**, including a real body imported before a new workspace/card exists, input artifact persistence, full preview/read, independent card business status, and re-read after plugin reload. [Results](tapd-live/rpc-results.json).
- Isolated web renderer: **11 checks passed before the later navigation failure**: candidate binding, credential-free public connection, real short-ID RPC, MCP guidance, no token input and in-viewport Save control at 1700px and 750px. Zero page errors. [Results](tapd-live/results.json), [wide form](tapd-live/connection-1700.png). The required shot helper always excludes the left 320px; the compact screenshot therefore does not show the entire modal. Compact control bounds and guidance were checked against the full viewport through Playwright.
- Applied to daily host: **7/7**, Flowly reloaded/running, `TAPD · QQ飞车` project connection saved and verified through the existing host MCP, client bundle 1,023,431 bytes. No token copied to Flowly. [Application receipt](tapd-live/applied.json). No daemon restart or infinite-canvas reload: its bundle stayed identical and plugin remained running. To keep the canvas alive while excluding a local development checkout from statistics, Flowly's anonymous telemetry preference was disabled through its SDK settings RPC; the daemon environment was not changed.

## Failed / incomplete

- Full working-tree run: exit 1, 1425 passed / 29 failed / 8 skipped. It includes the uncommitted independent canvas plugin's 14 passing cases; the independent exact-commit comparison above is authoritative for TAPD. Existing Windows paths, POSIX mode and Unix-socket assumptions remain.
- The UI script timed out locating New task / the project chooser after closing/resizing Settings; actual From TAPD selection and title prefill were **not accepted through that UI script**. Settings checks above and backend import/persistence are separate evidence. One debug page capture stalled; only its proven-owned headless Chromium process was stopped, after which the harness completed registry cleanup. Native desktop windows were untouched.
- The remote fork currently reports zero workflow runs, check runs, statuses and review comments for this head. Required CI gate / CodeRabbit evidence is absent; PR stays open and no protection is bypassed. `gh` is unavailable, so the connected GitHub tools created/read the PR.

## Cleanup and boundaries

- Fixture host `srv_Zy4onAchmmc4`, port 5537, home `.test-data/tapd-runtime-20261113`, telemetry forced off. Every run recorded and then removed only its own connections, cards and native project; final board empty and native project absent. Browser contexts closed. The daily QQSpeed connection is an intended deliverable, not a fixture.
- Isolated daemon stopped successfully. The explicit guarded PowerShell recursive removal of that owned home was rejected by automatic approval (`blocked by policy`); the home, including private fixture data, stays git-ignored. No alternate deletion tool or retry was used. Other pre-existing test directories were untouched.
- No TAPD writes, messages, status synchronization, model requests or copied MCP credentials. No ticket title/body, pairing link or credential exported to this report or screenshots. Runtime authentication stays in the existing `tapd` MCP configuration.
- Phone, authenticated native desktop interaction, a populated live comment thread and direct agent MCP read on a real session were not run. The adapter/connector and scoped artifact read paths are covered independently; a running plugin alone is not treated as these checks.
