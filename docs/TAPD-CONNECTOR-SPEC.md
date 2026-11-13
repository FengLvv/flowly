# Tencent internal TAPD inputs

User decision, 2026-11-13: integrate `tapd.woa.com`, use the user's existing MCP access to discover examples. This extends [CONNECTORS-SPEC](CONNECTORS-SPEC.md); its read-only, artifact ownership, cache, unread and card/session authorization rules still apply. Native project and workspace scope stays [single-root](SINGLE-ROOT-SPEC.md).

## Connection and transport

- Provider `tapd-internal`, family `tapd`. One connection names one TAPD project: `https://tapd.woa.com/tapd_fe/<workspace_id>`. A detail/list URL may be pasted in Settings; save normalizes it to that project root. Reject other hosts, protocols, credentials, ports and missing project IDs. Project IDs and 19-digit item IDs remain strings.
- This provider uses the fixed, already configured **tapd** MCP server through the host's installed `mcporter` or `@tencent/mcporter-internal` Node runtime. It is an explicit transport extension to the HTTP-only adapters, not a public `tapd.cn` API integration. No token field and no credential copying: authentication stays in the host's existing MCP configuration. Test/save checks the project is in `user_participant_workspace_get`; it never silently picks a project.
- The daemon resolves the installed runtime from PATH, launches Node using an argument array with a fixed bridge program, and passes JSON as an argument. No shell, configurable command, endpoint, tool name or arbitrary tool arguments from the client. Run from the host home, not a card repository. Failure and child stderr never expose configuration, URLs containing credentials or tool output. Missing runtime/server, login failure, timeout and malformed responses fail with actionable English errors.
- Fixed read-only whitelist: `user_participant_workspace_get`, `tapd_id_get`, `stories_get`, `bugs_get`, `tasks_get`, `comments_get`. Validate tool parameters, project, object type, pagination and IDs before dispatch. No discovery/write tools at runtime. Bound calls to 20 seconds, process to 25 seconds, output to 4 MiB; always close the MCP runtime. No background polling beyond existing visible connector reads.

## Item contract

- Requirements, bugs and tasks use existing `itemType` values `story`, `issue`, `task` (the last is added to the enum). Canonical keys include the project and kind: `tapd:<workspace_id>:<story|bug|task>:<id>`; canonical artifacts always use the returned **19-digit** ID, preserving precision and avoiding collisions across TAPD projects and other connectors. Card badges show `<kind>-<short suffix>`.
- Recognize internal `.../tapd_fe/<workspace_id>/<story|bug|task>/detail/<19-digit-id>` and list/iteration URLs with `dialog_preview_id=<story|bug|task>_<19-digit-id>`. The configured project must match exactly. Legacy detail URLs `/<workspace_id>/prong/stories/view/<id>` and `.../bugs/view/<id>`, `.../tasks/view/<id>` are also accepted on the internal host.
- Picker accepts links, canonical keys, `story-123`, `bug-123`, `task-123`, and bare short/19-digit IDs. Bare IDs search all three kinds; a short ID is resolved with `tapd_id_get` for its kind. No blind concatenation or conversion of long IDs to Number. Empty query lists recent items of the chosen TAPD project (not falsely labeled as the user's assignments); title search uses literal title text, never raw TQL/queryToken execution.
- Fetch exactly the requested project/kind/ID and validate returned project and ID. Empty search is empty; missing exact items are EXTERNAL_NOT_FOUND. Permission/auth errors are EXTERNAL_AUTH; missing tools/runtime and transient errors EXTERNAL_UNAVAILABLE; invalid project/link/key or malformed data EXTERNAL_INVALID. Empty comment responses are allowed only when explicitly reported as no data; unknown errors must not masquerade as empty results.
- Preview and `flowly_read_external` include title, description converted from HTML when needed, status, priority, owner, modified time and up to 20 comments. External state is reference only. Content fingerprints use title, description and comment ID/body/timestamp, excluding status/owner. Comment changes are checked even when the parent modified time is unchanged.

## UI and import

- Settings → Connections → TAPD: project address and optional name; explain the existing host MCP dependency and read-only access. Artifacts → + → TAPD work item, paste-link recognition, preview, New task → From TAPD, and agent reads reuse existing connector paths.
- New task imports the selected TAPD title using the existing untouched-title rule. On creation, when the user has left Description empty, import the first selected TAPD item's description on the daemon **before** provisioning a workspace. Never overwrite a nonempty user description, and never import comments as the card description. Other providers keep their behavior. Errors refuse creation before any native resource exists.
- All changed strings go in every catalog. Add TAPD to the tour's existing inputs row and README and add a one-time `tapd-connect` tip when a card is open (the Artifacts + entry is visible). No new setting/action telemetry field: existing connector counts suffice; never transmit project IDs or ticket content.

## Acceptance

1. Add/test/save/remove a project-scoped TAPD MCP connection without tokens reaching the client; existing stored connections remain readable.
2. Links, exact keys, short/long IDs, recent and title search support requirements/bugs/tasks with collision-free keys and no cross-project reads.
3. New-card title/description import, artifact recognition, preview and scoped agent reads work; body/comment changes mark unread, external status never moves a card.
4. Read-only whitelist, argument validation, missing runtime/auth/empty/error/timeout handling and bounded output are covered by focused checks; typecheck and existing connector tests pass.
5. Live internal MCP discovery/read is recorded without private ticket content; desktop/compact UI and installed-plugin checks, failed and unrun checks are reported separately. Test resources are owned and cleaned up; the persistent infinite canvas is not reloaded.
