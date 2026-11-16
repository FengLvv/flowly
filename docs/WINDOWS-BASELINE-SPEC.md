# Portable Windows regression gate

This extends WINDOWS-TEST-ISOLATION-SPEC for the accepted follow-up on 2026-11-16. Baseline and candidate are exact Git commits with fresh fixture homes; full failure identities, counts and exit codes are compared. Old worktrees, uncertain registrations and daily resources remain untouched.

## Contract

- A native file URL is decoded with URL semantics, never by taking `.pathname` or stripping `file://`. Catalog dependency traversal still forbids client imports of every catalog. Image references support absolute POSIX, drive and UNC paths, and valid local file URLs; relative paths, remote protocols and non-image files remain rejected. Session transcript/workspace authorization remains mandatory.
- Error reports retain only normalized relative paths inside the plugin root, on either Windows or POSIX; outside roots, sibling prefixes, traversal and node_modules stay redacted. Fingerprints still distinguish throw sites. Report payload fields and telemetry opt-out do not change.
- A leading `~/` local daemon address expands using native path joining. Transport fixtures use a unique Windows named pipe or POSIX Unix socket and fail explicitly on listen errors; authentication refusal and unavailable transport remain distinct.
- Native filesystem paths in API results and filesystem assertions use native path operations. Portable serialized identifiers keep `/` where their existing contract requires it. Skill source comparisons normalize checkout line endings only; text/checklist identity is otherwise exact.
- Private credential writes still request restrictive creation/chmod modes and never expose secrets to clients. Tests check that intent on all hosts and retain actual POSIX mode checks where supported; Windows mode bits must not be presented as ACL proof. Failure/retry tests inject the intended I/O error at the fixture boundary instead of relying on chmod to make the host unwritable.
- Git-based ownership/evidence tests keep their acceptance outcomes. Synthetic business fixtures avoid wall-clock and host Git configuration assumptions; genuine repository integration checks remain. No test is skipped or timeout raised merely to hide a failure.
- Vitest workers use a test-owned Git config, without inherited hooks, signing, caches or private index variables. Git integration fixtures set both author and committer dates around an explicit cutoff; changed/unchanged/error-fallback cases are asserted separately, without a one-second clock race.
- Default Windows runs cap workers at four to avoid oversubscribing real Git/process fixtures. They retain the same test list, assertions and per-test timeouts; the exact baseline comparison also uses four workers.

## Acceptance

- Implementer typecheck, complete affected suite and full default discovery run, with explicit pass/fail/skipped counts and baseline comparison. Preserve original assertions or document an equivalent platform-correct replacement and why.
- Independent `codex/gpt-6-luna`, created with `full-access` in this card's existing workspace, checks the final exact commit and owns its report. Do not alter earlier independent evidence.
- One concise run report under docs/verification records root causes, product vs fixture changes, commands and remaining/unrun checks. No version bump, runtime install/reload or daily resource mutation.
