# Automatic conversation titles

## Contract

Reference: Better Paseo `server/tasks/title-generation.ts` and `shared/title-generation.ts` (read 2026-11-17). Its automatic path starts from the first prompt, despite its legacy `afterFirstReply` setting name. This feature ports that automatic path only: no manual regeneration, preview, undo, custom prompt, streaming title animation or workspace renaming.

- Settings → AI features → **Auto conversation titles**, host-scoped and daemon-persisted, defaults off for both existing and new users. Enabling it permits sending up to 1000 characters of a new conversation's first user message to the configured summary model provider. It uses Flowly's ordered summary model fallbacks and AI output language, independently of Auto summary.
- Covers native root conversations on this host, including ones outside Flowly cards. At `agent.turn.before`, check that the event's turn ID is the first user message's actual turn ID. Do not backfill old conversations when enabling the setting, poll history or use the lifecycle event's deprecated empty timeline.
- Change only a blank title or Paseo's provisional title: first nonempty prompt line, whitespace collapsed, truncated to 60 UTF-16 code units and trimmed. Explicit titles, including Flowly's task-derived session names, are preserved. Do not change card titles, business stages, workspace titles/bindings, drafts, or messages.
- Skip child, archived, unavailable, background and Flowly summarizer sessions. Recheck the original workspace binding, cwd and title before applying, and read the switch again so turning it off cancels pending application. One attempt per first turn per plugin process, at most two active checks/generations and no unbounded job queue. Excess simultaneous starts are skipped; no automatic retries or later-turn rewrites.
- Generate a specific plain single-line title, requested at most 60 characters; accept nonempty output at most 80 characters, reject line breaks, quotes/fences and control characters. Treat conversation text as data. Use the existing read-only summary configuration and permission-denial runner in a temporary hidden child session labelled `flowly=summarizer`. It must never receive Flowly card tool credentials. Run timeout is 60 seconds per fallback; cleanup uses the existing owned-helper cleanup (`daemonRemoveAgent`: SDK archive for hidden agents; delete/archive compatibility fallback for older hosts), even after timeout, model error or invalid output. Never clean up the source or its workspace.
- The SDK has no session title setter. Write through the existing resolved Paseo CLI using argument arrays (`agent update <id> --name=<title> --home <home>`), then refresh the same session. No second client connection or direct data write. As in Better Paseo, the final title guard is best effort: the host has no conditional title update API.
- Failures keep the previous title, log through a fixed `logFailure` label without prompt/title contents, and never block the source turn. Plugin unload stops accepting jobs and suppresses pending writes; already-created helpers still finish cleanup.

## Guidance and telemetry

README and the welcome tour's More features list mention the optional switch and shared model selection. No extra one-time tip: this off-by-default capability is explained where enabled and in the tour. No new telemetry field or content collection: this increment does not measure automatic-title adoption. No What's new or version bump.

## Acceptance

1. Off means no timeline/model/rename activity. First-turn identity, provisional title matching and all exclusions are enforced for managed and unbound native conversations.
2. Short valid model output renames only the original conversation; explicit/manual title, moved/archived source, disabled switch and unload prevent stale application.
3. Duplicate hooks, simultaneous starts, model failure/timeout/permissions and malformed output cannot leak helpers or rename unrelated resources.
4. Typecheck, focused tests and whole suite results are reported separately from real provider, desktop/compact, phone and independent exact-commit verification. Preserve shared work and clean up owned fixtures.
