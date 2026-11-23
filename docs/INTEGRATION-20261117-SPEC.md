# Fork consolidation and upstream carry-forward

## 2026-11-23 follow-up

- Integrate the open PR in the personal fork, the implemented local changes, and current upstream main. Upstream open PRs are outside this integration.
- Keep the shared checkout intact while assembling and testing the candidate in an independent Git worktree. Keep existing card supplements, session attachments, workspace behavior, and test guards while reconciling the newer live subscriptions and modal changes.
- Synchronize local and remote main after merging. Preserve new local edits that arrive after capture and keep private or unreferenced verification artifacts local. A documented proposal does not count as shipped behavior.
- Run the repository tests and independent verification on the frozen candidate. Use GitHub CI evidence for that same candidate before merging. Report unavailable review checks and any pending authorization.

User request, 2026-11-17: consolidate all local/origin branches and PRs into the fork's main, then manually integrate the original project's newer main commits and synchronize the local checkout with the personal GitHub repository.

## Contract

- Preserve the existing fork behavior: single-root and lazy card workspaces, unlimited Flowly image attachments, editable description-to-instruction copying, cross-model dialogue context, TAPD, board panning, conversation controls and Runtime conversations.
- Preserve current Windows fixes and their business/security assertions. Stale shared files must not revert decoded file-URL validation or native resource isolation.
- Retain all captured local/origin branch tips in the consolidated history. Historical squashed feature branches use the current accepted implementation; their obsolete snapshots, release numbers and replaced UI must not overwrite newer behavior. Resolve overlapping active branches against their latest shared implementation and retain their evidence unchanged.
- Carry forward the 21 commits from upstream main through `61511d7`, resolving code and contract conflicts manually. Preserve fork-specific behavior while adopting SDK 0.16, background-agent handling, metadata/subscriptions, mobile composer support, Linear, card images, review improvements and fixes. Keep version 1.8.0; no release or What's new entry.
- Upstream `2cc6a0e` is already provided by the fork's `descriptionImages` implementation. Keep that storage/RPC contract, unrestricted Flowly image counts/sizes and explicit description-to-instruction action; do not install a second `task.images` store, the upstream 5 MB/8-image caps or automatic image sending. Its historical spec/evidence remain labeled reference material.
- Shared working files and index remain untouched until the reviewed integration is ready. Before updating the checkout, detect later edits and preserve them. The final non-ignored checkout and local main must match origin/main. Native projects, workspaces, sessions and daily plugin state are unchanged.
- Raw local native-registry audits contain unrelated resource identities and paths. Preserve them locally and ignore those two files; do not publish them. Never publish credentials or ignored local data.

## Review and checks

The fork has auto-merge disabled and produces no CodeRabbit check. After being told this limitation, the user explicitly instructed merging all branches/PRs now. Record this one-off instruction and the missing CodeRabbit evidence; do not claim CodeRabbit approval or alter repository protection/settings. Run typecheck, the focused integration suite, full tests and package checks on the exact candidate. The independent verifier is `codex/gpt-6-luna`, full-access, in the card's existing native workspace, using its own detached test checkout and owning its report. Do not substitute a provider/model or edit verifier evidence.

## Acceptance

1. Every captured local/origin branch tip and open PR is accounted for; active features survive and historical branches cannot revert newer behavior.
2. All 21 upstream commits have an explicit carry-forward disposition, including overlapping card-image, session, storage/RPC and Windows test changes.
3. Typecheck, focused/full tests, package/CI and independent exact-commit results distinguish pass, fail and unrun checks without weakening assertions.
4. No existing native resources or other-session edits are lost; private audit files remain local and ignored; only test-owned resources are cleaned.
5. PR final states, local main, origin/main and the non-ignored working tree are verified after the push. No upstream write or version bump occurs.
