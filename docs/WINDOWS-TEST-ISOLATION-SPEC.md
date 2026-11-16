# Native resource isolation in unit tests

## Contract

- Vitest run/watch use one fresh, test-owned `PASEO_HOME` per invocation, shared by workers, removed at teardown. Setup runs before application imports, sets `NODE_ENV=test` and `FLOWLY_TELEMETRY=0`, and clears inherited daemon routing and Flowly data/link overrides. No daily credential or pid file is copied. Tests of local transport create their own explicit fixture homes.
- Default discovery excludes `.test-data/**`, verification scripts and `.claude/**`, in addition to Vitest's built-in exclusions. Old worktrees and their files remain untouched.
- Native project create/delete tests intercept POSIX Paseo, Windows shims, the desktop runner and npm's Node entry. They allow real Git only; an unknown invocation throws instead of falling through to a real CLI. Existing create/delete, ownership, rollback and CAS assertions remain.
- Regression coverage exercises Windows command forms on every platform and proves that an unmocked CLI with the isolated home cannot discover the daily daemon. Test telemetry remains off.

## Existing registrations

Before tests, enumerate every native `ultra-linked-*` registration, including creation metadata, active/background/archived workspace references and Flowly project/card root or ID references. Compare the exact root with available fixture creation evidence. A matching name or missing directory alone is insufficient attribution. Remove only positively attributed, unbound test registrations through Paseo's project deletion API/CLI; retain uncertain registrations and all existing disk directories. Record the decision per ID and recheck the registries after tests.

## Acceptance

- Typecheck and the complete focused suite run; default full tests discover no old worktree tests. Record pass/fail/skipped counts and inherited failures separately.
- Isolated home has no daily credential/pid, CLI mock rejects unknown commands, and native project/workspace/Flowly binding snapshots show no test-created daily resources.
- Evidence goes in `docs/verification/windows-test-isolation.md`; no unrelated product behavior, weaker business assertions, UI/onboarding, telemetry schema or version changes. The accepted [Windows baseline follow-up](WINDOWS-BASELINE-SPEC.md) adds scoped native path/URL fixes and portable fixtures while retaining this isolation and ownership contract.
