# Workspace creation on first session

User decision, 2026-11-16. Amends PHASE-01/02 and SINGLE-ROOT creation timing.

## Contract

- Saving a directory/worktree card creates only the card. `workspaceId` is empty until provisioned; optional `workspacePlan` stores mode, original title, base and branch plus a stable native idempotency key. Existing cards without a plan retain their exact bindings and scope. Existing-workspace linking remains immediate and exclusive.
- Opening, editing, moving, deleting or wrapping up a card never provisions a workspace. Pending cards are available for their first session and show no missing-workspace warning. Reads do not call native workspace APIs with an empty ID. A pending card may be archived/deleted without native effects.
- Both New task + start and New session (managed or ordinary) provision through the daemon, only on submit. A shared per-store queue serializes provisioning across RPC/tool service instances. Native idempotency survives response loss, failed board persistence and daemon restart. Freeze the provisioning identity before the native call; later title edits do not change it.
- Bind the returned workspace atomically before preparing session credentials/context. Subsequent sessions reuse that ID. Session creation failure retains the binding for retry. Recheck card/project availability before provisioning and before binding; never rebind an existing card, change native ownership or delete resources implicitly. A workspace created during a conflicting edit remains recoverable by the same key.
- Workspace provisioning failure leaves the card and saved plan intact and reports the native error. Worktree base resolution remains validated before saving the card; native provisioning errors occur at first session. Successful binding increments the task revision; description-copy validation happens before provisioning. New session uses the returned live workspace ID, never the stale card prop.

## Guidance and telemetry

Update the tour concept map, README and a one-time tip: cards can be planned without native resources; the first session creates the workspace. No new switch or core action is introduced, so no heartbeat field changes.

## Acceptance

1. Saving directory/worktree cards does not create native resources; plans survive reload and preserve single-root source, base and branch.
2. Managed/ordinary first sessions provision once; subsequent/concurrent requests reuse the binding. Recovery after native response loss or board write failure uses the same key, including after title edits.
3. Pending card detail/context/edit/archive/delete/wrap-up stay usable; old and explicitly linked cards keep their bindings and ownership.
4. Run typecheck, focused business/recovery/client/i18n tests and record passed, failed and unrun checks separately. Desktop/compact live UI and exact-commit independent checks require separate evidence.
