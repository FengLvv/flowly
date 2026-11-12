# Windows workspace containment — 2026-11-12

## Change and scope

Code commit: `6005d4fcef181d8caa2b7ca9c532fee60fc0457f`, based on
`a597cc881c61af00bbd1d76e2680ec49d43cdcee` (`main`). The shared checkout remains on
`feat/session-context`; its unrelated changes are excluded from this fix.

`server/repos.ts` now checks the parent prefix using `node:path.sep`, matching
`path.relative` on the host. Absolute relative results (Windows cross-drive/UNC)
are still rejected. The canonical Git common-dir alternative is unchanged, so
external worktrees of the same repository and their descendants still match.
No storage, scope migration, native ownership or old-card write path changed.

Tests cover root/descendant acceptance, `..valid-child`, parent/sibling/prefix
rejection, Windows drive/UNC boundaries, POSIX paths, a real external Git worktree
and its subdirectory, and rejection of an unrelated sibling Git repository.
Existing service/store assertions preserve both unrestricted and selected legacy
scopes and workspace links.

Inputs: the card's reported failures,
[description-image evidence](description-images.md), the local
`description-images-baseline-tests.log`, and
[single-root contract](../SINGLE-ROOT-SPEC.md).

## Completed checks

All runs used `NODE_ENV=test` and `FLOWLY_TELEMETRY=0`.

| Runner / tree | Command | Exit | Result |
|---|---|---|---|
| Implementer / shared checkout plus fix | `npm run typecheck` | 0 | Passed |
| Implementer / shared checkout plus fix | `npx vitest run server/repos.test.ts server/repos-platforms.test.ts server/service.test.ts server/store.test.ts --exclude '.test-data/**' --testTimeout=15000` | 0 | 33 passed |
| Implementer / exact `6005d4f` | `npm run typecheck` | 0 | Passed |
| Implementer / exact `6005d4f` | `npm test -- --exclude '.test-data/**'` | 1 | 1284 passed, 28 failed, 7 skipped; 2 unhandled errors; 18 failed files include one collection failure |
| Independent Haiku / exact `6005d4f` | Typecheck; same focused suite | 0; 0 | 33 passed |
| Independent Haiku / `a597cc8` | Focused suite without the new platform test file | 1 | 27 passed, 3 failed |
| Independent Haiku / exact `6005d4f` | Same full-suite command | 1 | 1284 passed, 28 failed, 7 skipped; 2 unhandled errors |
| Independent Haiku / `a597cc8` | Same full-suite command | 1 | 1276 passed, 33 failed, 7 skipped; 2 unhandled errors |

The full suite is **not green**. Independent comparison found no new failure
identities. The original `repos.test.ts` negative assertion and two directory
range cases in `service.test.ts` fail on the baseline and pass on the candidate.
Two additional baseline failures disappear in that full run but fluctuate on
reruns; they are not credited to this fix. Both trees retain the
`shared/i18n.test.ts` collection failure and two Unix-socket errors on Windows.

[Independent evidence](windows-containment-independent.md) belongs to session
`0db511d6-f0fe-4ce0-b547-65f27612e57b` (`claude/claude-haiku-5-5`,
`bypassPermissions`), launched in this card's existing workspace. The implementer
did not edit that report. Local ignored logs:
`windows-containment-main-tests.log`, `windows-containment-candidate.log`, and
`windows-containment-baseline.log`. An initial sandboxed focused invocation
could not spawn workers (`EPERM`); it ran no tests and was retried successfully
with permission. No assertions were weakened or skipped to obtain the pass.

## Resource cleanup

The independent session was archived through Paseo; `flowly_get_task` confirmed
its archived state in this card. No fixture native project, workspace or card was
created. The baseline worktree was removed after checking its canonical cleanup
target, clean Git state and node_modules junction. An initial bulk forced cleanup
was denied by automatic policy without a detailed reason; removing only the
verified junction and then using `git worktree remove` without `--force`
succeeded. The candidate remains available for the final handoff checks; its
removal and the final native/card resource check are recorded in the card's
delivery receipt. The pre-existing `session-context-pr-check` worktree is outside
this run's cleanup scope.

## Unrun and product upkeep

- Real cross-drive filesystems and UNC shares: unrun; platform string tests cover
  these boundaries using `path.win32` and synthetic canonical directories.
- POSIX hardware: unrun; `path.posix` boundaries are exercised on Windows.
- UI, phone, plugin installation/reload and live user-data mutation: unrun.
- No onboarding/tour/tip change: this restores the existing workspace eligibility
  contract and introduces no capability or control to announce.
- No telemetry field/notice change: no new switch, action or collected data.
  No version bump or What's new change.
