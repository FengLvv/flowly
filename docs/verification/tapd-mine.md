# TAPD My to-dos — 2026-11-16

Product commit: `e5f78964b1555856de0767ae5143ff62e27a4497`, in [PR #3](https://github.com/FengLvv/flowly/pull/3). The shared checkout stays on `main`; a temporary Git index keeps the existing TAPD branch's history and excludes unrelated canvas/session changes.

## Applied behavior

New task → From TAPD and Artifacts + → TAPD default to **My to-dos**, using the host MCP account's pending requirements, bugs and tasks in the configured project. **All work items** restores project recent/title search. Explicit links, keys and numbers resolve directly in either mode. No username, token, persisted setting, RPC field or schema migration was added.

The three project-only todo calls extend the fixed read-only whitelist. Title matching is literal and case-insensitive before truncation; foreign-project rows are dropped, and a failed endpoint cannot return everybody's or a partial list. Real empty bug/task responses use prose, accepted only for the requested project and kind. Unknown prose and authentication failures remain errors.

## Implementer checks

| Command / check | Exit | Result |
|---|---|---|
| `npm run typecheck`, final product tree | 0 | Pass |
| `npx vitest run server/connectors/tapd.test.ts server/connectors/tapd-mcp.test.ts shared/tapd.test.ts shared/connectors.test.ts shared/i18n.test.ts client/onboarding-logic.test.ts --exclude '.test-data/**' --testTimeout=15000` | 0 | 190 passed / 0 failed / 0 skipped |
| `FLOWLY_TAPD_LIVE=1` opt-in `server/connectors/tapd.live.test.ts` | 0 | 1/1; real membership, All, My to-dos, body/comments and short-ID lookup, including explicit-empty bug/task endpoints |
| `npm run typecheck` then `npm test -- --maxWorkers=4 --reporter=json --outputFile=<owned temporary path>`, exact final commit in an owned detached worktree | 0 / 1 | 1435 passed / 25 failed / 8 skipped; existing Windows/path/socket and run-order failures |
| `node --check docs/verification/tapd-mine-live.mjs` | 0 | Pass |
| Impeccable detector, changed client targets | 0 | No findings |

The [independent full-access Haiku verification](tapd-mine-independent.md), session `d27b4c40-3f57-406d-9601-e36ced0c3f21`, owns the exact-commit comparison: typecheck 0; focused 249 passed / 1 failed (the baseline Windows Jira file-mode assertion); full 1436 passed / 24 failed / 8 skipped. Every final failure also appears on its baseline. Counts vary with run order; no new failing identity was found. That report was written and revised only by the verifier. The verifier session was archived after delivery.

## Installed and UI checks

- Daily host: **9/9** checks passed after reloading **only Flowly**. The existing account returned **5** My to-dos versus **10 recent** rows in All; title search found an own item. Existing project/card/workspace ID bindings were unchanged. The separately loaded infinite-canvas client bundle remained byte-for-byte identical and running. No daemon restart, canvas reload, message, TAPD write or daily fixture record. [Application receipt](tapd-mine/applied.json).
- UI fixture: complete final runner exit **0**, **23/23**, zero page errors; recorded in [results](tapd-mine/results.json). The runner uses owned synthetic TAPD data on a separate daemon and the installed Paseo renderer served locally. Public app hosting timed out, so the local renderer avoids network-dependent page loading and matches daemon version 0.16.0-beta.2.
- Desktop and 750px controls, result scope, empty/error/Retry, explicit other-owner import, reset on close, both picker entry points, artifact persistence and reload are checked in the runner. Screenshots/text use only `docs/promo/shot-lib.mjs`. The mandated left-320px privacy exclusion hides part of the compact modal; full-viewport control bounds and selected/result states are checked separately, so the compact screenshot is not evidence of complete visual coverage.
- The installed host drops `accessibilityState.selected` from button DOM attributes. The original harness selection assertion was replaced with the rendered selected border plus result-ownership checks, and desktop screenshots were inspected. Product/unit assertions were not weakened.

Earlier attempts failed on harness startup/pairing, Chromium discovery, selection attributes, the existing five-second connector backoff and an asynchronous artifact-write race. Those attempts are not combined into a final pass; the complete runner is rerun after corrections. The live TAPD test initially found the explicit-empty prose issue, which was fixed before final product verification.

## Cleanup and limits

Each fixture records its home/project/connection/task/workspace IDs before subsequent operations. The runner removes its plugin connection and project/cards, removes the native project/resources, rereads board/native resources, closes browsers and stops its daemon. The final cleanup receipt is in the runner results.

Automatic approval rejected two filesystem cleanup commands with `blocked by policy`: stopping/removing the first retained fixture home, and removing the implementer's dependency junction/test worktree. No alternative deletion mechanism was used. Retained owned homes are listed in [retained homes](tapd-mine/retained-homes.json); their listeners are checked closed. The implementer worktree remains at `.test-data/tapd-mine-20261116/implementer` on the final product commit. These are git-ignored test directories, not daily board projects. Other sessions' worktrees and root dependencies are preserved.

Unrun: native phone/window UI, dark-theme comparison, and a populated real comment thread (unchanged from earlier TAPD acceptance). No additional onboarding tip/rule or tour section was warranted: the existing TAPD tip and README explain the visible filter, all nine catalogs were updated. No telemetry field was added for a transient search scope; existing connector counts suffice. Anonymous usage remains off on the development installation. No version bump or What's new edit.

PR #3 remains open: GitHub reports no check-runs and no review on this fork. Auto merge stays off while required CI/CodeRabbit evidence is absent; protection was not bypassed.
