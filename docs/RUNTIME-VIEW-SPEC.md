# Runtime view of Paseo conversations

## Scope and entry

User-approved 2026-11-16: Runtime is an additional view of all native Paseo conversations on this host, including those with no Flowly card. One conversation is one card; never aggregate sessions by task/workspace. Keep project boards and business stages unchanged. Create or bind no Flowly resources for this view.

Runtime is a fixed desktop tab before project tabs and a row in the compact project chooser. Preserve cold-start/last-project behavior. This replaces the previous task-card runtime proposal and plans/global-kanban.md. No lane-width settings, filters, statistics, timers, density, Git/context/todo, AI titles or bulk actions.

## Groups and data

Group snapshots as Needs attention (question/permission), Running (running or actual initialization), To review (failed or finished unread), Idle (settled/read/closed), Archived (archived native conversations). Missing state is unknown, never invented success. History restoration without an active turn must not look like a new run. Retain cached facts with a visible stale warning and retry. Each native agent ID appears once, with its real workspace/project identity. Task business state does not determine runtime groups.

Reuse shared live agents and SDK metadata paging, not per-project polling or dialogue prefetch. Mount only visible virtualized lanes. Preserve closed/unavailable-provider sessions. Provider-internal subtasks without native IDs remain outside scope.

## Original Flowly conversation sidebar

A card opens the existing Flowly SessionPreview directly, without the task overview or Better Paseo details. Reuse transcript, composer, images, questions, model/permission/provider controls and native shortcut. Back/Close returns to the mounted Runtime with group, horizontal/vertical position and per-session drafts preserved. Seed the composer from daemon drafts before mounting its input; keep a per-conversation draft cache for close/reopen. Draft-read failures offer Retry before exposing an empty composer. Late results and operation locks cannot target another session.

Real card context keeps its existing checks. Unbound sessions use an explicit native workspace scope, not a fake task ID or temporary card. Conversation RPCs accept mutually exclusive task/workspace targets and freshly verify the exact agent/workspace pair and native workspace availability. Reject missing, moved or archiving resources and mixed/missing scope. Model/feature mutations reuse the existing server adapter, fresh reauthorization and cleanup. Task tools, workpad/Done and task instructions require real card context. Opening never sends a prompt.

Preserve existing drafts/queues/read receipts; optional workspace scope supports unbound sessions without rewriting old records. Preserve invalid data. Validate transcript/image reads against the exact session, including local-file references on Windows and Unix. Queue drain rechecks its saved target, never current UI selection. No second client connection.

## Existing gestures

The user explicitly requires Flowly blank-area right-button horizontal panning and its bottom native scrollbar. Reuse client/board-pan.ts: exclude cards/buttons/headers; preserve card context menus; stop on release/leave/cancel/missing buttons, view/layout change and unmount. Keep ordinary mouse/touch scrolling. Scrollbar remains hidden by default and during panning, appears in the bottom 16pt hover region with overflow, and remains draggable. Compact keeps single-group navigation. Runtime has no task-state drag.

## Guidance and compatibility

Use current theme, native primitives and shared interruptible motion/Reduce Motion. Pause hidden work under compact conversation details. Runtime stays mounted independently of selected conversation/project; explicit project choice leaves it. Update tip runtime-view, More features, READMEs and every catalog. No dependency/version bump/What's new or telemetry field: no additional usage/content collection.

## Acceptance

1. Sessions across at least three native projects, unbound sessions and multiple sessions in one task/workspace appear separately once. Runtime/unknown/stale/archive/closed/provider/error/initialization facts are correct. No task/resource writes.
2. Bound and unbound cards directly open original Flowly conversation UI with exact-session transcript, send, questions, settings, drafts, read and queue behavior. Back/Close and rapid switching preserve Runtime and session isolation.
3. Missing/moved/archiving/wrong-workspace targets, mixed/missing scope, stale writes and provider errors reject without unauthorized mutation/leaked connection. Existing task-scoped data and behavior remain compatible.
4. Right-button blank-area panning, exclusions/cancellation, bottom scrollbar visibility/drag, ordinary scrolling, card menus and compact/project-board interactions do not regress. Excluded enhancements remain absent.
5. Typecheck, focused/full tests, independent exact-commit and real desktop/compact/phone evidence report failures/unrun separately. Clean only owned fixtures; synchronize guidance/translations.
