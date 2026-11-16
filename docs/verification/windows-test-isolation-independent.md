# Windows test isolation: independent verification

- Card: b9490a95-ce3b-4072-87fb-0b763bddbcf2
- Candidate commit: 0ca55b459e3bf23cf3fa9f45935d7246fbc0928e (parent a45f4f50f4c3983c30657619c90158fbd3703c56); final integration candidate: 4c895e0350ecd425824bfb4ed681b31e1a85e8aa (see Final integration)
- Verifier model: claude-haiku-5-5; mode: bypassPermissions (full access); session ID: 4d50978f-03b9-4b9d-88ab-3aea1d774b74
- Checkout: `.test-data/windows-test-verifier-b9490` (HEAD verified as candidate, clean before `npm ci`; fresh `npm ci`, exit 0)
- Environment: Windows 11, Node/npm per checkout, `NODE_ENV=test`, `FLOWLY_TELEMETRY=0`

## Results (candidate)

| Command | Exit | Result |
|---|---|---|
| `npm run typecheck` | 0 | clean |
| `npx vitest run <focused 4 paths>` | 0 | 5 files, 28 tests passed |
| `npm test -- <focused 4 paths>` | 0 | 5 files, 28 tests passed |
| `npm test -- --maxWorkers=2` | 1 | 161 files: 145 passed, 15 failed, 1 skipped; 1409 tests: 1377 passed, 25 failed, 7 skipped |
| `npm pack --dry-run` | 0 | `server/testing` not in the tarball (0 matches) |

Focused suite passes. The full suite has 25 failing tests in 15 files (list below).

## Failures and parent comparison

Parent baseline: a45f4f5 in `.test-data/windows-test-verifier-b9490-parent-baseline`, run on the same 15 failing files only (not the full suite). **Disclosed overlay:** the parent has no vitest config. A temporary `.verifier-parent-vitest.config.mjs` in that checkout matches the parent's original script (`testTimeout 15000`, excludes `docs/verification/**` and `.claude/**`), with no global or setup files. Run environment: fresh empty `PASEO_HOME`; `PASEO_HOST`, agent/workspace routing and Flowly data overrides cleared. This is not an untouched parent run.

- Parent, 15 files: 24 failed, 182 passed (206 tests).
- Failing identities in the 15-file runs: every one of the 24 parent failures also fails on the candidate (no parent-only identity in that run).
- Candidate-only identity: `server/auto-review.test.ts > linked root: commands run only in the repositories this delivery changed…` fails once in the full candidate run (expected `['SMITH']`, received `['Admin','SMITH']` at line 871). It also fails on the parent in 2 of 3 standalone runs, so it is not candidate-only.

Failing files (both trees, Windows-specific causes visible in output: `EACCES` on Unix-socket `listen`, POSIX path expectations such as `/home/someone/...`, `/fixture/...`, and `a/docs/spec.md` separators): `client/catalog.test.ts`, `server/agent-service.test.ts`, `server/artifacts.test.ts`, `server/auto-review.test.ts`, `server/connectors/jira.test.ts`, `server/error-report.test.ts` (4), `server/local-daemon.test.ts` (3), `server/naming.test.ts`, `server/project-folder.test.ts` (2), `server/project-skills.test.ts`, `server/session-images.test.ts` (3), `server/skill-source.test.ts`, `server/tool-server.test.ts`, `server/usage.test.ts`, `server/workflow-insights.test.ts`.

**`server/auto-review.test.ts` is flaky on Windows in both trees.** Standalone runs, candidate ×3: 2, 2, 3 failures. Parent ×3: 5, 2, 3 failures. Identities vary across runs; in the standalone parent runs `R1` and `R2` also failed, which the candidate standalone runs did not hit. Attribution: inherited, pre-existing, not caused by the candidate. This is not proven to be exact equality of failure sets.

## Findings

- No High finding in the candidate's changed code. Focused and isolation tests pass; the test-only mock, home, and exclusion changes read correctly; `server/testing` is excluded from the package.
- Medium (inherited, out of this card's scope): 15 test files fail on Windows, independent of the candidate. Causes are platform assumptions, not isolation.
- Limit: the parent comparison covers only the 15 failing files, not the full parent suite. The candidate-only `auto-review` identity was not isolated to a root cause. The timing lead (`since` set before real Git calls) was not verified and is not claimed.
- Limit: `auto-review` flakiness was sampled over 3 runs per tree; a rate cannot be stated.

## Cleanup (owned by this verifier)

- Checkout (keep until parent says so): `F:\Project\Paseo_plugins\Flowly\.test-data\windows-test-verifier-b9490` (contains `node_modules`, `.verifier-*.log`, `.verifier-*.json`).
- Parent baseline checkout (created by this verifier via `git worktree add --detach`; remove with `git worktree remove`, then `git worktree prune`): `F:\Project\Paseo_plugins\Flowly\.test-data\windows-test-verifier-b9490-parent-baseline` (contains `node_modules`, `.verifier-parent-vitest.config.mjs`, `.verifier-*.log`).
- Temp files outside the checkouts: see the exact list in "Cleanup paths" at the end of this report.
- No daily resources were read, written or deleted. No native CLI was run against a daemon. No implementation files were edited.

## Final integration (candidate 4c895e0350ecd425824bfb4ed681b31e1a85e8aa)

Remote main is now 373998bdc403b78cbe3cb8520df10b375303c9e5 (lazy-workspace card #6). The candidate was rebuilt on that head. Task-owned files (`package.json`, `server/linked-projects.test.ts`, `server/project-remove-paseo.test.ts`, `server/testing/**`, `vitest.config.mjs`) are byte-identical to 0ca55b4. The checkout is detached at 4c895e0 with tracked source clean and the existing `node_modules` (no reinstall).

| Command | Exit | Result |
|---|---|---|
| `git rev-parse HEAD` | 0 | 4c895e0350ecd425824bfb4ed681b31e1a85e8aa |
| `npm run typecheck` | 0 | clean |
| `npm test -- server/linked-projects.test.ts server/project-remove-paseo.test.ts server/paseo-cli.test.ts server/testing` | 0 | 5 files, 28 tests passed |
| `npm test -- --maxWorkers=4` | 1 | 161 files: 145 passed, 15 failed, 1 skipped. 1418 tests: 1387 passed, 24 failed, 7 skipped |
| `npm pack --dry-run` | 0 | `server/testing` absent (0 matches) |

Failure identities: all 24 are in the parent 15-file evidence set (0 new identities). The 24 are the same as the 0ca55b4 full run minus `auto-review` "linked root: commands run only in the repositories this delivery changed…", which was the variable case that also failed on the parent in 2 of 3 standalone runs. Parent attribution is therefore the same as before. Parent evidence limits still apply: the baseline was a 15-file run with the disclosed overlay config and isolated home, not the full parent suite, and it was taken at a45f4f5, not 373998b. No parent rerun was needed because no new identity appeared.

Limitations:
- Single full run on this head; no flake sampling by design.
- Parent baseline is old (a45f4f5) and covered only the 15 failing files.
- Full-suite count differences from the earlier run (1409 → 1418 tests) come from the rebased base code, not from the task files.

Verdict: the task changes pass typecheck and the focused suite on the new head. The full suite's 24 failures are the same inherited Windows failures already demonstrated on the parent, with no new identity. These are not caused by this card's changes, but they remain unfixed on Windows.

## Cleanup paths (verifier-owned; do not remove anything else)

- Candidate checkout (remove only when the parent says so): `F:\Project\Paseo_plugins\Flowly\.test-data\windows-test-verifier-b9490`
- Parent baseline checkout (`git worktree remove` then `git worktree prune`): `F:\Project\Paseo_plugins\Flowly\.test-data\windows-test-verifier-b9490-parent-baseline`
- Parent temp home: `C:\Users\vilolu\AppData\Local\Temp\flowly-parent-home-CWCm`
- Temp helpers: `C:\Users\vilolu\AppData\Local\Temp\flowly-parent-home-path.txt`, `C:\Users\vilolu\AppData\Local\Temp\flowly-parent-vitest.config.mjs` (unused temp config), `C:\Users\vilolu\AppData\Local\Temp\cand.txt`, `C:\Users\vilolu\AppData\Local\Temp\cand1.txt`, `C:\Users\vilolu\AppData\Local\Temp\cand2.txt`, `C:\Users\vilolu\AppData\Local\Temp\parent.txt`, `C:\Users\vilolu\AppData\Local\Temp\parent15.txt`, `C:\Users\vilolu\AppData\Local\Temp\c-.verifier-ar.log.ids`, `C:\Users\vilolu\AppData\Local\Temp\c-.verifier-cand-ar-1.log.ids`, `C:\Users\vilolu\AppData\Local\Temp\c-.verifier-cand-ar-2.log.ids`, `C:\Users\vilolu\AppData\Local\Temp\c-.verifier-cand-ar-3.log.ids`, `C:\Users\vilolu\AppData\Local\Temp\p-.verifier-parent-ar-1.log.ids`, `C:\Users\vilolu\AppData\Local\Temp\p-.verifier-parent-ar-2.log.ids`, `C:\Users\vilolu\AppData\Local\Temp\p-.verifier-parent-ar-3.log.ids`, `/tmp/cand.txt`
- Parent overlay config (inside the parent checkout): `F:\Project\Paseo_plugins\Flowly\.test-data\windows-test-verifier-b9490-parent-baseline\.verifier-parent-vitest.config.mjs`
- Not mine and not listed: `cand-fails.txt`, `cand_fail.txt` in `%TEMP%`.
