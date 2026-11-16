# Windows full-suite repair

Card `b9490a95-ce3b-4072-87fb-0b763bddbcf2`; implementer session `2278f331-f62c-4b18-b161-c8e5e00fe37d`.

## Scope and baseline

The user accepted the inherited-Windows-failure follow-up in this card. Inputs: current AGENTS.md, WINDOWS-TEST-ISOLATION-SPEC, relevant artifact/image/telemetry/local-daemon/skills specs and progress; previous independent isolation evidence. Current independent model preference is `codex/gpt-6-luna` in `full-access`, confirmed available.

Exact baseline: `a06159092cc444105af181e9858fabdfc8007bca`, latest origin/main when started. Dedicated detached checkout `.test-data/windows-baseline-b9490`, fresh `npm ci` (0), no shared node_modules. The shared root contains other sessions' edits and was not used as the verification tree. Baseline and candidate tests use isolated PASEO_HOME with telemetry off; no daily credentials, daemon or uncertain registration was used by tests.

| Check | Baseline | Repair tree |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | exit 0 |
| Full discovery: baseline `npm test -- --maxWorkers=4`; repair `npm test` (Windows default now four workers) | exit 1; 1377 passed / 34 failed / 7 skipped | exit 0; 1431 passed / 0 failed / 7 skipped |
| Complete affected suite, 21 files | not a separate baseline run | exit 0; 258 passed / 0 failed / 0 skipped |
| `npm run test:ci` | unrun | exit 0; 4 passed |

Both full commands used Vitest's JSON reporter only to retain counts and exact identities. The 34 baseline identities are absent from the final failure set; no new failure identity. Twenty new regressions explain the total test count change (1418 to 1438). The same seven existing skips remain. No old worktree test was collected. [Structured comparison and original failed-test output](windows-baseline-results.json).

Focused paths: `client/catalog.test.ts`; `server/agent-service.test.ts`, `artifacts.test.ts`, `auto-review.test.ts`, `connectors/jira.test.ts`, `error-report.test.ts`, `local-daemon.test.ts`, `naming.test.ts`, `project-folder.test.ts`, `project-skills.test.ts`, `session-images.test.ts`, `skill-source.test.ts`, `tool-server.test.ts`, `usage.test.ts`, `workflow-insights.test.ts`, `testing/`, `linked-projects.test.ts`, `project-remove-paseo.test.ts`, `paseo-cli.test.ts`; `shared/images.test.ts`. After each fix the whole group was rerun; earlier rounds were 256/1 and 257/1, both due to remaining CRLF checks. Passes were not stitched across rounds.

## Product defects and fixture assumptions

| Area | Finding and repair | Assertions retained |
| --- | --- | --- |
| Catalog traversal | URL.pathname became a doubled Windows drive path; use fileURLToPath, normalize only dependency labels to `/` | Walk every client import; forbid all catalog imports |
| Native paths | Artifact absolutePath mixed separators; skill result used native separators for a portable serialized reference | Exact normalized absolute result; stable portable relative reference; relative symlink resolves to the same single file |
| Images | Drive/UNC references were rejected; stripping file:// failed drive prefixes and escaping | Valid absolute/file URL image handling; relative/device/invalid URLs rejected; transcript, workspace, file type and missing-file checks retained |
| Error reporting | Path operations depended on the test host, and prefix checks accepted lexical traversal | POSIX/drive/UNC fixtures on every host; normalized containment, sibling/traversal/module redaction and throw-site fingerprints |
| Local daemon | Tilde expansion mixed separators; Windows fixtures listened on POSIX paths and timed out after EACCES | Real named pipe on Windows / Unix socket on POSIX, credential hello, auth refusal vs unavailable, finally cleanup |
| Private writes | Windows stat mode bits are not POSIX privacy bits | Every atomic private write must request 0600 on all hosts; actual 0600 stat on POSIX; all signature/tampering/secret-redaction checks remain. This does not claim Windows ACL inspection |
| Snapshot failure/retry | chmod did not create an unwritable Windows directory | Inject EACCES at the expected .flowly write, verify per-project error isolation, board remains usable, migration failed/current/written and next-run retry |
| Line endings | Git checkout CRLF differed from embedded LF skill text | Normalize CRLF only, then compare the entire checklist/source content exactly |
| Auto review | POSIX-only path fixture predicates; host Git config and real-time future cutoff | Native basename/exists checks; test-owned Git config; both author and committer dates fixed around an explicit cutoff; uncommitted/committed/unchanged/error-fallback outcomes tested with real Git |

The Git fixture setup clears inherited GIT_* variables in workers and uses its own config (no daily hooks/signing/cache settings or private index). The read-only host-setting probe recorded only whether selected keys existed, never user values. Windows worker cap avoids oversubscribing real Git subprocesses; test timeouts and business assertions are unchanged.

## Limits and delivery

- Frozen code commit: `c501a4e80d1055fe034202c1cb697d00f80d8604`. Independent `codex/gpt-6-luna`, created in `full-access`, session `1f919658-edd8-4896-8836-5cdd59ba3613`, verified that exact commit in a fresh detached checkout: typecheck 0, complete affected suite 258/258 (0), default full 1431 passed / 0 failed / 7 skipped (0), local release-tooling 4/4 (0), and package dry-run 0. All 34 baseline failure identities are absent; no High or Medium finding. [Verifier-owned report](windows-baseline-independent.md) is preserved verbatim. The follow-up evidence commit changes documentation only.
- [PR #7](https://github.com/FengLvv/flowly/pull/7) is ready for review. GitHub currently reports no Actions runs, status checks or CodeRabbit review; these remote gates are pending, not passed. The fork has automatic merging disabled. The repository's required CI gate and CodeRabbit review must be satisfied or explicitly waived by the user before merge.
- No runtime install/reload or UI action. Existing guidance already describes local transcript images/artifacts/skills; these compatibility fixes add no flow or headline feature, so no new tour/tip is warranted. No i18n string, telemetry field/schema, dependency or version change. Error-frame privacy is covered with synthetic sinks; no PostHog network requests were sent.
- Windows ACL audit, actual remote UNC access, non-Windows execution, desktop/phone UI and live daily daemon behavior are unrun. Protocol fixtures prove transport/auth behavior without connecting to the user's daemon.
- Old worktrees and all 14 uncertain ultra-linked registrations are preserved. Only explicitly owned new checkout/session/temp fixtures may be removed after verification. Raw daily registry snapshots stay local.
- Post-verification read-only audit: 22 native projects / 93 workspaces, matching the pre-run counts; all 14 uncertain entries are byte-equivalent after JSON serialization, and the three protected older worktrees remain. The audit is separate from isolated tests and performed no native write. The finished verifier was confirmed idle in full-access before its exact session and owned detached checkout were removed. No global worktree prune was run.
