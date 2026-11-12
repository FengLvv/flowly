# Paseo 0.16.0-beta.2 real-daemon check: background agents and background work

- Date: 2026-11-12. Host: the user's local Paseo daemon 0.16.0-beta.2 (ws://127.0.0.1:6767). Plugin: Flowly installed from the working tree (uncommitted changes of the card "Paseo 0.16 接入：后台任务"), SDK 0.16.0-beta.2, reloaded with `paseo plugin reload flowly`.
- Fixture: temporary git repo under `$TMPDIR/p16live-*`, Flowly project `p16 live e2e`, card `Write HELLO.md`, one Claude `claude-haiku-5-5` session that started `sleep 900` in the background, wrote HELLO.md and delivered to In review. Scripts: `setup.mjs`, `watch.mjs`, `done.mjs`, `step2.mjs`, `cleanup.mjs`; logs `watch1.log`, `done.log`, `step2.log`, `cleanup.log`.

| Check | Result |
|---|---|
| Summary, auto review, memory review, Insights digest, workflow insights created with `background=true` | PASS (5/5) |
| None of them in the default agent list at any poll (every 5 s) | PASS (`ever visible: []`) |
| All archived after the run (only `includeBackground` lists them) | PASS |
| Review prompt has "Background tasks still running in the delivering session" with the `sleep 900` item | PASS (review passed) |
| Card drawer shows the idle session as `Background tasks running` | PASS (`card.png`) |
| Done with background work: auto wrap-up skipped, `wrapup-check` blocker, `tasks.wrapup` refused | PASS |
| `backgroundWork.stop`, then `wrapup-check` has no blockers or warnings | PASS |
| `Flowly background` workspace is `background=true`, absent from the default workspace list | PASS |
| Digest and workflow insights results normal (digest JSON written; workflow run `ok`) | PASS |
| No new outside-session insight run for Flowly's own helpers | FAIL first, PASS after fix (below) |
| Cleanup: project removed with *Also remove from Paseo* (2 workspaces), no agents/workspaces/project left, temp dir and `removed/` backup deleted | PASS |

Bug found: after the memory review, Flowly started `Flowly insights · Flowly memory review · Write HELLO.md`. The host's hook agent (`describeHookAgent`) has no `labels`, so `isSummarizer` never matched on the hook path. Fix: `isOutsideCandidate` also skips `background=true`; new assertion in `server/session-insights.test.ts` fails without the fix and passes with it. Rerun after reload: digest and workflow insights started no insight run.

Not run: a Codex background task; the 0.15 host regression on a real daemon; an independent verification session.
