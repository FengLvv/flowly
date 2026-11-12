# Session dialogue context

## Contract

User decision, 2026-11-12: use public SDK timeline reads to inherit dialogue text across models, limited to this project. This is a text snapshot, not a provider-native session clone. Images, tool results, reasoning and previous session configuration are excluded.

- The card's **New session** form has a searchable **Context from** picker, default **None**. It lists non-archived, non-background sessions in the linked native project's active workspaces, including sessions outside cards. A workspace bound to a card of this project is also eligible when its native owner differs (single-root legacy/link compatibility). Other projects and internal helper sessions are excluded. Load this small metadata projection only while the picker is open; no polling.
- The selected source can use a different provider/model. Creating always uses the target card's existing workspace, fresh target work instructions, new agent identity and credentials. Source sessions/workspaces, permissions, environment, labels and card identity are never copied or modified. Ordinary sessions use the same text import without Kanban credentials.
- Read the source again at submit, before preparation/creation; validate project membership and a live source workspace/session before and after paging. The snapshot contains only user/assistant message text in chronological order, labelled by speaker, in a text attachment. Its preamble identifies the source and instructs the model to treat the dialogue as historical reference, with current task instructions taking precedence.
- The UI explicitly says **Recent dialogue text only, up to 60,000 characters. Images and tool results are excluded.** Read at most 1,000 projected entries, in pages of 100; keep the newest 60,000 dialogue characters. Mark omitted older content (including a partial message) in the attachment. The snapshot ends at the first read's tail; later source turns do not get pulled in. Empty text, missing/archived/reassigned sources, unavailable workspaces, failed reads and rewritten/stale/non-advancing cursors fail visibly and create nothing. Never fall back silently to an empty session.
- Retain form choices on failure. Source id participates in the creation attempt fingerprint. Existing prepared-agent recovery runs before reading the source, so an uncertain creation response recovers the target without resending anything even if the source has since disappeared. A retry whose target does not exist reads a fresh snapshot. Default None keeps the existing creation path.

## RPC

- `sessions.context-sources({taskId})` -> `{entries: [{id,title,workspaceName}]}`. Resolve the active target task/project from storage; page SDK workspaces and agents on the daemon, return eligible metadata only.
- `sessions.context-read({taskId,agentId})` -> `{title,text,truncated}`. Schema-validated, read-only, bounded text, explicit errors. No persistent board schema change and no extra Paseo connection.

## Guidance and telemetry

Add a More features tour entry, README highlight and a one-time `session-context` tip when an open card has a session; update all catalogs and the onboarding tip table. Do not change What's new. No new setting or heartbeat field: existing session creation measurements cover this optional creation input, and no source id/text is sent to telemetry.

## Acceptance

1. None preserves blank creation; same-project sources include other cards and native unbound sessions and exclude unrelated/archived/internal ones.
2. Context export preserves chronological user/assistant dialogue, crosses pages, bounds size, labels omissions, excludes tool/permission/reasoning/image data, and fails on empty/error/stale history.
3. Creation passes the attachment to a new session in the target workspace with target-only authorization; source remains untouched; prepared recovery does not replay the initial prompt.
4. Desktop and compact picker/search, failure/retry, target message receipt, and persistence after reload are verified separately from unit/type checks. Report unrun checks explicitly.
