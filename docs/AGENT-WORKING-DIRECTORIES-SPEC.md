# Agent working directories and user authorization

Approved by the user's 2026-11-18 request to remove the workspace-only instruction and allow authorized external operations. This amends the task instruction boundary in [PHASE-02-SPEC](PHASE-02-SPEC.md) section 2 and the agent context in [SINGLE-ROOT-SPEC](SINGLE-ROOT-SPEC.md); it does not change resource ownership.

## Contract

- `scope.repoPaths`, `scope.directories` and the workspace starting directory identify the card's default working locations. They are not an allowlist for everything an agent may operate on.
- New-session context and explicit **Send Kanban work instructions** must allow operations outside those locations, including other directories, applications and external services, when authorized by the user. Existing authorization in the conversation is sufficient; do not ask again merely because an operation is outside the workspace. Without authorization for an external operation, ask before performing it.
- A worktree still isolates only its Git project root. Directory mappings, including linked roots and legacy multi-repo cards, remain accurate and unchanged.
- Provider permissions and approval policies still apply. Flowly does not change provider modes, bypass denials, or grant access to an external account. Denied access is reported.
- One project still binds one native root; one card still binds at most one workspace. Flowly tools still validate the bound agent/card/workspace, current revisions and saved scope. Artifact paths and delivery worktree validation retain their existing restrictions; authorization for an agent's external tools does not broaden Flowly's file-serving or board-write APIs.

## Compatibility and errors

There is no storage, RPC or tool schema change and no new error code. The generated runtime skill and the packaged skill must agree. New sessions and freshly generated explicit work instructions use the new wording after plugin reload. Reload rewrites the runtime skill, but does not rewrite a session's saved system prompt or erase its history. An existing session can receive the updated explicit work instructions and the user's authorization; if an older higher-priority instruction still blocks it, start a new session on the same card. Do not interrupt or recreate other sessions automatically.

This corrects agent instructions without a new control, entry point, headline capability or telemetry event. No welcome-tour copy, one-time tip or heartbeat field is warranted; the skill itself supplies the updated agent guidance. No version bump or What's new change.

## Acceptance and checks

1. Root, worktree, linked-root and legacy contexts retain their mappings and say these are default working locations, with user-authorized external directories/applications/services allowed.
2. Both skill copies require authorization for external operations, reuse existing authorization, and retain provider permission/denial guidance. No workspace-only instruction remains in generated context or skills.
3. `workingInstructions` carries the same policy for the explicit existing-session path. Card/workspace authorization and file-serving guards remain unchanged.
4. Run `npm run typecheck` and focused scope, skill, service and tool-server tests. Record failures and unrun live model behavior separately from string/contract assertions.
