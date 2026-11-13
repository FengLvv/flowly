# TAPD UI and agent read acceptance — 2026-11-13

This completes the UI and actual-agent checks left open by [the initial delivery](tapd.md). Production connector/client/server code was unchanged. The only tooling fix outside the runner is `docs/promo/shot-lib.mjs`.

## Cause and fix

`hidePrivate` walked from the current project label to arbitrary labelled siblings on the toolbar row. After a screenshot it left **New task**, **Filter** and other controls with inline `display: none`; later navigation timed out. It now hides only other elements with `role=tab` on that row. Compact layouts have one project switcher and need no tab hiding. A DOM regression covers privacy, actionable navigation and retained board content.

The runner also waits for the actual board action before proceeding, uses accessible button roles (not assumed HTML button tags), chooses items by their `Choose key: summary` accessible label, separates desktop/compact pages and uses a card-specific session preparation operation ID. It reuses a paired context after closing the desktop page to avoid unnecessary cold loads. No assertion or host idempotency protection was weakened.

## Results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Exit 0 |
| `node --check docs/verification/tapd-live.mjs` and `docs/promo/shot-lib.mjs` | Exit 0 |
| Full isolated `node docs/verification/tapd-live.mjs` with explicit owned home/project/item env | Exit 0, **26/26** |
| Real Playwright DOM privacy/navigation regression | **7/7** |
| Actual `claude/claude-haiku-5-5` turn, `bypassPermissions` set before running | **TAPD_READ_OK** |

The complete runner was rerun after the fixes, rather than combining earlier partial passes. [Runner results](tapd-ui-followup/results.json), [privacy regression](tapd-ui-followup/capture-privacy.json), [AI result](tapd-ui-followup/ai-read.json).

- **New task → From TAPD:** short-ID and URL selection, exact title prefill, preserved user title, empty-description import on Save (508 characters, byte-for-text equal to the fetched Markdown body), and nonempty user description kept unchanged. Card status stayed Todo; form creation did not start a model session.
- **Artifacts + → TAPD:** URL lookup created one input, desktop/750px preview rendered the actual body, and the already-linked picker row was disabled without adding duplicates. UI-created body and artifact survived an isolated Flowly reload.
- **Compact:** From TAPD and preview body were visible within the full 750px viewport; a separate page avoided carrying a desktop modal/resizing state. The mandated image helper still excludes the left 320px, so screenshots do not claim full compact visual coverage; full-viewport control/body bounds were checked separately.
- **Agent tools:** real fixture session `15990850-9bb0-480e-b86d-c4bd4192d350`, model `claude-haiku-5-5`, full mode. Its actual timeline contains ToolSearch, `flowly_get_task`, a successful `flowly_read_external` for its own input and an expected failed read for the other card (`EXTERNAL_NOT_FOUND`). Its final response was only `TAPD_READ_OK`; no ticket business text was exported. The reproducible runner also creates an idle real session and verifies the same MCP scope directly.
- **Privacy:** other project tabs are hidden, the current tab stays, New task remains clickable, Filter and board remain visible, private tab text is omitted from export, and compact switchers leave navigation intact. No ticket title/body, pairing link or credential is in the saved reports/screenshots.

## Cleanup and scope

Owned fixture: `.test-data/tapd-ui-followup-be189859`, server `srv_ntz-mSw4WShZ`, port 5539, telemetry forced off. Each run removed only its own connection/cards/project/sessions and reread the native registry. Final board, native project, workspaces and test sessions were empty; an include-archived agent listing returned 0, including the actual AI test session. Browser contexts were closed and the fixture daemon was stopped. [Cleanup](tapd-ui-followup/native-cleanup.json), [daily preservation](tapd-ui-followup/daily-preservation.json).

The guarded PowerShell directory deletion was rejected by automatic approval (`blocked by policy`). Its private git-ignored home remains; no retry or alternate deletion mechanism was used. The earlier retained fixture and all unrelated directories were untouched.

Daily Flowly and infinite-canvas were read only: no reload/restart, no daily fixture resources, intended TAPD connection still present and infinite-canvas still running. Native user windows and canvas content were never operated on. Phone/native-window UI and a populated real comment thread remain unrun; the full working-tree test suite was not repeated for a verification-helper-only change (the prior independent baseline comparison is unchanged). No onboarding copy, tip or telemetry field change is warranted for this tooling fix.

Earlier attempts: wrong private-helper navigation/labels, a cleanup response-shape mismatch, a cold page load timeout and reuse of a session-preparation operation ID were corrected in the runner. All attempts cleaned their native/plugin resources; the final 26-check run passed as one run. The independent verifier's earlier implementation report was not edited.
