# First-session workspace verification — 2026-11-16

Source: shared uncommitted tree, base `a45f4f50f4c3983c30657619c90158fbd3703c56`. Other sessions' work is preserved. This is implementer evidence, not independent exact-commit evidence.

## Passed

- `npm run typecheck`: exit 0.
- `npx vitest run server/service.test.ts server/store.test.ts server/wrapup.test.ts server/workspace-restore.test.ts server/archived-sessions.test.ts server/card-detail.test.ts server/board-overview.test.ts client/session.test.ts client/onboarding-logic.test.ts shared/i18n.test.ts shared/session-attention.test.ts shared/attention.test.ts --exclude '.test-data/**' --exclude 'docs/verification/**' --exclude '.claude/**' --maxWorkers=2 --testTimeout=15000`: exit 0, 11 files / 181 passed. Includes delayed directory/worktree plans, concurrent provisioning across services, native failure and failed binding-save recovery with unchanged keys after rename/reload, archive races, legacy/linked scope, pending reads/wrap-up, managed/ordinary launch targets, translations and tip lifecycle.
- `npx vitest run server/tool-server.test.ts -t 'first-session preparation' --exclude '.test-data/**' --exclude 'docs/verification/**' --exclude '.claude/**' --testTimeout=15000`: exit 0, 1 passed / 12 unselected. Confirms binding precedes the scoped credential and two session preparations share one workspace.
- `node docs/verification/lazy-workspace-live.mjs`: exit 0, 20/20 checks against an isolated real Paseo daemon with its own home and telemetry forced off. Uses the installed renderer and `shot-lib.mjs`; desktop 1350px and compact 750px can open a pending card and its New session form without allocating a workspace or showing a missing-workspace warning. Concurrent daemon requests create one native directory workspace; managed preparation and a real native session share it. Repeated submission, plugin reload and deleting another pending card preserve the binding.
- Live session ID: `c077db23-95a4-4704-83b7-cbd1e9383ecb`, workspace `wks_e8869758367bd897`. The fixture session was created with `claude/claude-haiku-5-5`, `bypassPermissions`; no model turn was sent. This is resource-creation evidence, not AI response evidence or an independent verifier session.
- Fixture board and native registries read back empty; session deleted, owned workspace archived, project removed, browser/daemon stopped and owned home removed. Daily board, native windows and infinite canvas were untouched during fixture verification. Recorded IDs/checks: [owned resources](lazy-workspace/owned-resources.json), [results](lazy-workspace/results.json). Screenshots use the mandated helper's privacy clipping and do not prove complete modal layout.
- `git diff --check`: exit 0.

## Failed / earlier attempts

- A wider related suite: 187 passed / 3 failed (190 total), exit 1. Two `server/project-folder.test.ts` permission-failure expectations do not produce write denial on this Windows environment. The new tip exposed a prior test's exhausted-tip list; it now explicitly includes the new tip and passes in the final suite. Neither permission assertion was weakened.
- Existing `server/tool-server.test.ts -t 'prepared ID'`: exit 1, 1 failed / 11 unselected at the existing slash-concatenated CLI-path assertion (`data/flowly.mjs` versus Windows `data\flowly.mjs`). That assertion is unchanged. The dedicated first-session credential regression passes independently of it.
- The initial test invocation also collected old retained `.test-data` trees and was interrupted; final focused commands exclude them. Do not treat that incomplete run as full-suite evidence.
- Early live attempts could not discover cached Playwright / a matching browser. Discovered local module/browser paths were supplied through the helper's documented environment overrides. A later attempt used the wrong button name (`Start an agent` rather than `Start session`); fixed the harness selector. Each attempt cleaned its fixture home/resources. The final whole run passed.

## Unrun / limits

- Full `npm test`, independent verification on a task-only commit, commit/push/PR, physical Android/iOS and native desktop-window UI, live worktree provisioning, and actual model reply/message delivery are unrun. Unit tests cover worktree provisioning inputs and managed/ordinary message options; the live harness checks session resource ownership only.
- No new telemetry field or switch: this changes allocation timing of the existing card/session actions. Tour concept copy, one-time tip, both READMEs and all catalogs are updated. No version or What's new changes.
- `paseo plugin reload flowly`: exit 0, running under the same local checkout/runtime ID. A fresh `paseo plugin ls` confirms both `flowly` and the untouched `infinite-canvas` running. The daemon was not restarted.
