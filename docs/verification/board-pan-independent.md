# Board blank-area right-drag pan: independent verification (final candidate)

- Verifier session (my provider session): 3a3c5ab8-d062-43e7-821a-0c0288fab29c. Independent of the implementer; full bypassPermissions; no child sessions created.
- Real Paseo session ID for this card's verification, as given by the main session: f0402931-d9a5-48cf-801e-60f55353c656. I did not check it.
- Final candidate commit: d0c8bb7ab51ae8e5c282ba6578bb48294a87f045 (`feat: pan board blank space with right mouse drag`), 18 files, base origin/main a45f4f5.
- **Superseded:** the earlier candidate 3f49069e634a3c7340e0a9b252a247e75f5190b3 was replaced by d0c8bb7. Its results (in the previous report run) do not cover d0c8bb7.
- Worktree: `.test-data/board-pan-final-3a3c5ab8`, detached at d0c8bb7. It has its own `node_modules` (`npm ci`, exit 0). No junction or symlink.
- Env: NODE_ENV=test FLOWLY_TELEMETRY=0 DO_NOT_TRACK=1 PASEO_HOST=127.0.0.1:1, PASEO_HOME=`<worktree>/home`.

## Commands

| Command | Exit | Result |
|---|---|---|
| `npm ci` (worktree) | 0 | dependencies installed |
| `npm run typecheck` | 0 | clean |
| `npx --no-install vitest run client/board-pan.test.ts client/onboarding-logic.test.ts client/geometry.test.ts shared/i18n.test.ts --testTimeout=15000` | 0 | 4 files, 137 tests passed, 0 failed |
| `npm test -- --reporter=json --outputFile=<worktree>/home/full-suite.json` | 1 | 302 files, 1419 tests: 1383 passed, 29 failed, 7 pending; 18 files failed |

## Full-suite failures (not fixed; none is a board-pan test)

All 18 failing files are Windows-environment or host-setup issues. None lives in the board-pan, onboarding-logic, geometry or i18n tests. Examples from the first error of each file:
- Path separators or drive prefix: `naming`, `artifacts`, `tool-server`, `usage`, `error-report`, `client/catalog` (test built `F:\F:\...` from `URL.pathname`, so the import walk never ran).
- CRLF vs LF: `skill-source`.
- Numeric or mode mismatch (`expected 438 to be 384`): `agent-service`, `connectors/jira`.
- Spawn of the installed `Paseo.exe`: `linked-projects`.
- Deep-equal mismatches: `auto-review`, `local-daemon`, `project-skills`, `project-remove-paseo`, `workflow-insights`, `project-folder`, `session-images` (`Not a local image reference`).

**Not verified:** I did not run these 18 files at a45f4f5, so "pre-existing" is unproven. The `client/catalog` failure means the test that keeps catalogs out of the phone bundle did not run. It needs a Windows path fix before it counts as a pass.

## Source review of d0c8bb7 (no assertions or implementation changed)

- The capture-phase assumption is gone. `board-pan.ts` has no `onPointerDownCapture` or `onContextMenuCapture`.
- `exclude(event)` calls `cancel()`, resets `suppressMenu = false`, then calls `excludeBoardPan`. It is wired as `onPointerDown={excludePan}` on the card slot, the collapsed lane header, the lane header, and the older-cards toggle wrapper.
- `onPointerDown` resets the latch and cancels any press before evaluating a new one. A fresh press that is not a valid pan start leaves `suppressMenu` false, so its own menu opens.
- Lane header menu: `columns.tsx:413` calls `pan.onContextMenu` first and falls back to the header's own `onContextMenu` when it returns false, so the header menu runs independently.
- Root cancel paths: pointer up for the same pointer, pointer cancel, pointer leave, blur, disabled or live drag. The root uses only bubbling `onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`, `onPointerLeave`, `onBlur` and `onContextMenu`.
- Touch: `!touch` disables the pan handlers, and the native scrollbar shows on touch.

Concern to check in the live run: the root's `onContextMenu` only sees the menu event if the host bubbles it. The menu latch depends on that, so it must be proved in the real host, not in unit tests.

## Not run

- Live UI and real-host checks. These are for the main session's isolated host run. This unit-level review does not verify UI behaviour.
- Baseline comparison of the 18 failing files at a45f4f5 (not run; see above).

## Cleanup

- Nothing was deleted. The worktree and its `home/` directory are still in place and still registered with git, as instructed.
- Owned paths left for the main session: `.test-data/board-pan-final-3a3c5ab8` (worktree + `node_modules` + `home/full-suite.json`).
- Earlier incident, in the previous worktree (`board-pan-independent-3a3c5ab8`, commit 3f49069): I ran `git worktree remove --force` while a `node_modules` junction still existed, and the main checkout's `node_modules` was emptied. Git reported "Permission denied", and I did not verify whether it followed the junction. I restored dependencies with `npm ci` (exit 0; `vitest` and `typescript` present). The main checkout's `node_modules` was not changed in this run.
