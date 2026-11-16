# TAPD title-only display — 2026-11-16

Product commit `441e48d372505d10818bbf06275ccfc307ff51b1`, follow-up in [PR #3](https://github.com/FengLvv/flowly/pull/3).

TAPD picker rows and selected chips show only the item's title. Artifact rows and preview modal titles remove an exact canonical-key prefix for display, including existing saved records; TAPD ID badges, automatic type/status/time lines and IDs in action labels/toasts are hidden. User notes and the warning about another card using an item remain. Stored keys/titles, URLs and deduplication are unchanged. Other providers keep their presentation.

| Verification | Exit | Result |
|---|---|---|
| `npm run typecheck` (shared tree and exact commit in owned test worktree) | 0 | Pass |
| `npx vitest run server/connectors/tapd.test.ts server/connectors/tapd-mcp.test.ts shared/tapd.test.ts shared/connectors.test.ts shared/i18n.test.ts client/onboarding-logic.test.ts --exclude '.test-data/**' --testTimeout=15000` | 0 | 190 passed / 0 failed / 0 skipped |
| `npm test -- --maxWorkers=4 --reporter=json --outputFile=<owned path>`, exact commit | 1 | 1434 passed / 26 failed / 8 skipped; known Windows and run-order failures, including the previously observed scoped CLI flow failure |
| `TAPD_UI_EVIDENCE_DIR=docs/verification/tapd-title node docs/verification/tapd-mine-live.mjs` | 0 | **27/27**, zero page errors; full desktop/750px run |
| `node --check docs/verification/tapd-mine-live.mjs` and Impeccable detector | 0 | Pass / no findings |
| Daily installed application/readback | 0 | **6/6**, only Flowly reloaded; canvas bundle identical, existing cards, stored artifact titles and references retained |

The existing three-kind face-key assertion was changed from a short-ID badge to `null` to match the user's explicit display contract; exact identity and URL assertions remain. No new implementation-mirroring tests were added. UI assertions cover actual title-only desktop/compact rows, a title-only selected chip, and an existing-format artifact without a stored-reference rewrite, alongside the earlier scope/error/Retry/import/reload checks. The complete runner passed as one run. Screenshots were taken through `docs/promo/shot-lib.mjs`; desktop was visually inspected. The mandatory privacy crop excludes the left 320px, so compact screenshots are partial; actual control bounds and title-only results are checked in the full viewport.

The first application receipt used an overly literal local-variable source match; bundling renamed that variable. The served-helper check was corrected and the complete application check rerun; product source was unchanged. [Application](tapd-title/applied.json), [UI results](tapd-title/results.json), [desktop](tapd-title/wide-mine.png), [compact](tapd-title/compact-all.png).

Fixture board/native registries reread empty; browser and daemon stopped; owned listener checked closed. Under the prior automatic-approval cleanup restriction, the git-ignored home recorded in `tapd-title/owned-resources.json` and the reused `.test-data/tapd-mine-20261116/implementer` worktree are retained; no blocked deletion was retried. No daily native project, card, message or TAPD write was created. The shared checkout stays on main and other work is preserved through a temporary Git index.

Unrun: phone/native-window and dark-theme checks. No new catalog string, onboarding tip/tour change or telemetry field is warranted for this presentation-only refinement. No schema/version bump or What's new edit. This is a small UI follow-up, not a new storage/RPC/release milestone requiring another independent session; prior independent evidence remains owned and unchanged. PR #3 still lacks CI/CodeRabbit checks and remains open.
