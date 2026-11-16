# Runtime conversations — 2026-11-16

Card: `53970163-6ece-4ae5-b1e6-e0ddc0057baa`. Implementer: `499e48f6-d96d-40d9-9655-a79bf7f94c95`.
Target: shared uncommitted working tree; parent HEAD `ab25171`. This is not exact-commit evidence.

## Delivered behavior

- All native Paseo conversations on the host, one card per session, including unbound conversations and multiple sessions in a single workspace. Existing project boards and business status remain separate.
- Both bound and unbound conversation cards open the original Flowly SessionPreview directly, with its transcript/composer and existing controls. Back/Close keeps Runtime mounted, preserves horizontal position/compact group and restores per-session drafts.
- Reuses Flowly blank-area right-button panning, card context menus and native bottom scrollbar: hidden normally/while panning, revealed at the bottom hover edge, draggable.
- Explicit workspace targets extend the existing session RPCs without synthetic card IDs. Existing task scopes and persisted drafts/queues/read receipts remain compatible. Exact workspace membership is revalidated; image references stay session-scoped. Provider-unavailable read behavior matches the original card view.
- Scope excludes lane width settings, filters/statistics/timers, Git/todo/AI-title features and Better Paseo detail/chat renderers. No dependency/version/telemetry schema/What's new changes. More features tour, one-time Runtime tip, READMEs and nine catalogs updated; project/card tips are hidden in Runtime.

Inputs: the user's latest scope decisions and two screenshots; Better Paseo source `RoundRedDot/better-paseo` at `f7a17a707b8abbb62cb725bdfbed8d2474bb830e` as previously inspected; project single-root, project-tabs, native/session, attention, drawer, performance and onboarding contracts. [Runtime contract](../RUNTIME-VIEW-SPEC.md).

## Passed

- Final `npm run typecheck`: exit 0.
- Final related suite, with `NODE_ENV=test FLOWLY_TELEMETRY=0`: exit 0, **16 files / 206 tests**. Files: client focus-ring, attention, onboarding-logic, session, session-link, shortcuts, board-pan; shared runtime-view, session-attention, images, i18n; server native-session, session-settings, composer, session-tail, session-images, session-reads (only existing matching files counted by Vitest).
- Independent precommit check: `claude/claude-haiku-5-5`, full-access equivalent `bypassPermissions`, session `ec771de7-c0db-43af-be4d-56b8a7d94b32`: typecheck exit 0, 26 files / **245 tests**, no High findings. Its Medium provider/read-state finding was fixed and rechecked. [Verifier-owned evidence](runtime-view-independent.md). Later root draft initialization fix is covered by the final root suite/UI, not claimed as independently rechecked.
- `FLOWLY_TELEMETRY=0 DO_NOT_TRACK=1 node docs/verification/runtime-view-live.mjs`: exit 0, **22/22 desktop/compact checks**, no page errors. Isolated native daemon and installed renderer; no daily native window or canvas interaction. Three native projects, four sessions (two share a bound workspace), one Flowly task. Proves individual cards, direct original chat for bound/unbound sessions, Runtime Back position/group, draft close/reopen, right pan/exclusions/menu and native scrollbar hide/reveal/drag. Opening and drafts sent no model prompt; transcript send/question/provider operations were covered by source/unit checks, not live message delivery.
- Fixture cleanup verified Flowly board empty, native registry/resources empty, daemon stopped, browser closed and exact owned home removed. Independent test session was verified idle, deleted by exact recorded ID and read back absent. Daily resources were preserved.

## Failed and corrected

- Initial related checks caught old task-based test fixtures, nullable project render branches, global read-receipt lookup, a settings workspace reauthorization gap and Windows image paths. Final focused suite passes after fixes; no assertions weakened.
- UI harness discovery/geometry/selector errors (Windows Playwright cache, native project descriptor field, fitting window without overflow, existing context menu dismissal and duplicate composer test IDs) were corrected in the owned script.
- Actual UI exposed draft loss on close/reopen. Fixed by seeding before mounting the input, preserving a per-session cache through sidebar closure, and retrying draft-read errors. Entire UI sequence then passed. Earlier draft failure screenshot/text are retained as `runtime-view/draft-before-fix.*`.

## Full-suite limits and unrun gates

- Broad shared-tree run before final fixes: exit 1, **1505 passed / 27 failed / 8 skipped**. One own focus-ring omission was fixed; 25 other failed identities match the earlier Windows shared-tree evidence, and one additional sqlite-store failure was not established as baseline.
- Second broad run (`npm test -- --maxWorkers=4 --reporter=json`) before the final draft fix: exit 1, **1489 passed / 43 failed / 8 skipped**. Focus-ring passed. Twenty-two failed identities match earlier Windows evidence; twenty-one do not. Their attribution is unresolved; do not call this an all-green or exact baseline run. [Failure details](runtime-view-full-failures.json). No broad suite was rerun after the final draft-only UI fix; the complete relevant suite and live UI were rerun.
- UNRUN: phone/IME/Reduce Motion and native touch gestures; exact-commit independent gate; clean-commit CI/PR; live message delivery, provider-setting changes and question responses through the new Runtime entry; dedicated archived/provider-unavailable UI cases. No commit/push/version bump/PR was created.
- User install is the existing directory plugin `flowly` at `F:\Project\Paseo_plugins\Flowly`. Reload receipt is recorded in the card delivery; plugin status alone is not UI evidence.

## Screenshots

[Desktop Runtime](runtime-view/desktop.png) · [Direct chat](runtime-view/direct-chat.png) · [Compact chat](runtime-view/compact-chat.png) · [Compact Runtime](runtime-view/compact-runtime.png) · [Structured UI checks](runtime-view/results.json).
