# Session controls and native Paseo parity

## Decision and boundary

User-approved 2026-11-16: extend the existing server-only local daemon adapter for session model and provider-feature changes. This supersedes SESSION-UX-SPEC §1's prohibition on a new internal connection **only for these card-scoped operations**. Never create another client connection, import private host UI, change the host, or replace sessions to change a model. SDK/type versions and manifest remain pinned.

The installed public SDK 0.15.0 exposes model discovery and live feature state but no model/feature setters or embeddable native agent pane. The daemon client's `setAgentModel` and `setAgentFeature` are the compatibility bridge; remove it when the supplied public SDK exposes equivalent operations. All other operations retain their existing SDK/CLI routes. No promise of pixel or host-plugin parity is made.

## Capability comparison

| Native chat capability | Flowly behavior |
| --- | --- |
| Model selection | Same provider's selectable catalog, scoped by session cwd; change the existing session in place. Keep its current id visible if missing from the catalog. Catalog loading/error/empty states are explicit and retryable. |
| Reasoning and permissions | Existing controls, using the selected model's reasoning options and the session's advertised modes. Refresh after every attempted write. |
| Speed / Fast / Plan and provider controls | Render the session's advertised toggles and selects generically, including option descriptions. Send ids and typed values, never hard-code provider names or feature ids. Missing controls are not invented. |
| Send / steer / interrupt / stop | Existing exact-text delivery and queue behavior; configuration never sends a prompt, changes scope, or moves the card. |
| Questions and approvals | Existing pending-request forms and fresh membership checks. Rich native approval details remain available through Open in Paseo. |
| History, streaming, tools, images, drafts, next moves, subagents | Existing projected history/virtualization, live refresh, tool details, web image attachments, per-session drafts, Flowly suggestions and native child navigation. History beyond the preview cap opens native. |
| Reload session | Public SDK reload, explicit confirmation before interrupting a running turn, fresh membership and operation lock. |
| Copy message text | Copy user/assistant message text through host clipboard. No prompt or data write. |
| Native slash/skill/plugin commands, arbitrary attachments, dictation/voice, rewind, rich host timeline plugins | Open the exact session in native Paseo. No fabricated command execution, duplicate host runtime, destructive timeline mutation or undocumented client imports. Provider switching remains new-session creation, as in native running sessions. |

## Mutation and UI contract

- Extend `sessions.configure` with `modelId?: string` and `feature?: {id:string,value:boolean|string}`. Each new model/feature mutation is a single operation; reject mixed bundles before any side effect. The daemon rechecks the current non-archived task, project and session workspace before mutation. Validate models against fresh selectable provider discovery (including aliases for current-state matching), and features against the refreshed session's exact toggle/select shape. Unknown ids, wrong types and unavailable options fail without opening a connection. Serialize mutations per session and reject overlapping requests rather than replay them later.
- Open a short-lived authenticated local connection only after validation, require the relevant method, forward provider errors and always close it in `finally`. Log unexpected daemon failures with a fixed `logFailure` label and log-only context. Never expose credentials. No fallback to creating/reloading a session, clearing history or changing permissions.
- Composer menus are scrollable and height-bounded on desktop and compact layouts. Feature selection opens its advertised options; toggles display translated On/Off. Disable all configuration choices while an operation is pending or the task/session is not writable. A synchronous shared session lock blocks duplicate presses and overlap with send/answer/archive. Do not mark selection optimistically: the streamed/refetched session is authoritative. On success or failure refetch, including when the provider partly applied a change before rejecting; show error and allow retry. A late operation completion must not alter another selected session or a closed view.
- Keep the native-session shortcut. No global polling, new dependency, persistence schema, version bump or telemetry field. This exposes existing native configuration rather than a new Flowly switch; no feature ids, selected models or message contents are added to telemetry.

## Guidance

Add a Session controls More features entry, README highlight, and once-only `session-controls` tip when a card with sessions is open, after the existing session-context tip. Translate all new strings in every catalog and remove obsolete read-only explanation strings. Do not change What's new.

## Acceptance

1. Select a second model and each advertised toggle/select value on an isolated session; native and Flowly state agree and survive plugin reload. The original session id, workspace, dialogue and card status remain unchanged; no prompt is sent.
2. Wrong workspace, archived/deleted task/project/session, non-selectable model, unknown feature, wrong value type, invalid option, overlapping write and provider rejection fail visibly without unauthorized mutation or leaked connection.
3. Reasoning/permission controls remain usable; failed changes refresh actual state; rapid presses cannot overlap other session actions. Desktop and compact menus scroll within their available viewport.
4. Copy/reload preserve message text and ownership; running reload requires confirmation. Native-only capabilities remain reachable through the exact native session entry.
5. Typecheck, focused tests, full-suite results and actual UI/runtime checks are reported separately, including failures/unrun checks. Independent exact-commit verification uses the user-selected Haiku model when available.
