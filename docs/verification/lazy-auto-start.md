# Create and start follow-up — 2026-11-16

Input: user reported that checking Start an agent now did not start an agent, then confirmed that reproducing it now works and the earlier operation may have been mistaken. No product source was changed in this follow-up. The earlier failed attempt's cause remains undetermined.

## Passed

- `node docs/verification/lazy-auto-start-live.mjs`: exit 0, 7/7 checks. Uses a new isolated Paseo home/daemon, actual installed renderer and the required screenshot helper, with telemetry off. Through the real 1350px New task form: fill title/description, toggle Start an agent now, fill Instruction, click Create and start. The card acquired its workspace, exactly one session was created with the explicitly discovered `claude/claude-haiku-5-5` and `bypassPermissions`, and the timeline showed the first instruction marker and an assistant response. No manual send was used.
- Test session `0efc9d46-d8c4-4dcd-864b-e6ad4fbe0a0f`. IDs and checks: [resources](lazy-auto-start/owned-resources.json), [results](lazy-auto-start/results.json). Fixture session deleted; owned workspace archived/project removed; native and board registries empty; browser/daemon stopped and owned home removed. Daily resources/windows/canvas were preserved.
- `npx vitest run client/session.test.ts server/service.test.ts --exclude '.test-data/**' --exclude 'docs/verification/**' --exclude '.claude/**' --testTimeout=15000`: exit 0, 27/27 across 2 files.
- `git diff --check`: exit 0.

## Failed

- Current shared-tree `npm run typecheck`: exit 1. No product file was changed by this follow-up and no baseline comparison was performed. Errors: `unref` on a `number` in `index.server.ts:242`, `server/auto-review.ts:372`, `server/memory.ts:517`, `server/telemetry.ts:283,286,362`, `server/workflow-insights.ts:225,226`; URL/AbortSignal overload errors in `server/connectors/http.ts:84` and `server/telemetry.ts:368`; spread of a non-object in `server/tool-server.test.ts:36`. These were recorded without changing other sessions' work. No install/reload was performed in this turn.

## Unrun / limits

- This follow-up did not reproduce the original failure and does not attribute it to user error. Manual description-copy, other providers/worktrees, compact/physical phone, full suite and independent exact-commit checks are unrun in this follow-up. Earlier lazy-workspace verification remains separately recorded.
- No behavior, onboarding, telemetry, dependency, version or What's new changes. No commit/push/PR.
