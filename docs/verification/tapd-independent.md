# TAPD independent verification

- Test session: ea94a1a8-abc6-49a4-b71c-53811192711f (claude-haiku-5-5, read-only)
- Candidate: 7a93ef63c78f36f75fb32f833650f8134b795366 (feat/tapd-inputs)
- Baseline: a45f4f50f4c3983c30657619c90158fbd3703c56
- Method: git archive of each SHA into .test-data/tapd-indep-1602/{cand,base}, node_modules junctioned, NODE_ENV=test FLOWLY_TELEMETRY=0.

| Command (candidate) | Exit | Result |
|---|---|---|
| npm run typecheck | 0 | pass |
| focused vitest (12 files: shared/tapd, tapd, tapd-mcp, shared/connectors, onboarding-logic, i18n, jira, azure, shortcut, confluence, github, gitlab) | 1 | 229 pass / 1 fail / 0 skip (230) |
| npm test --exclude '.test-data/**' (json) | 1 | 1448 total: 1411 pass / 29 fail / 8 skip |
| npm test same (baseline) | 1 | 1397 total: 1361 pass / 29 fail / 7 skip |

## Failure diff (by file + full test name)
- New failures in candidate vs baseline: none. Fixed: none. The same 29 fail on both (pre-existing, environment/Windows related: local-daemon, error-report, linked-projects, session-images, etc.).
- The one focused failure is the pre-existing Jira POSIX file-mode test (jira.test.ts "saving tests the token; the stored file is private...").
- Candidate adds 51 tests and 1 skip (live test); none fail.

## Review findings (static read, no TAPD calls, no live test)
No high-risk findings.
- Read-only whitelist: tapd-mcp.ts rejects any tool not in schemas (Object.hasOwn) and zod-validates args before spawning; no write tool names found in tapd code.
- Long IDs: ids kept as strings (19-digit regex); numeric ids that are not safe integers are rejected, so JSON.parse rounding cannot yield a wrong id; tests cover this.
- Project boundary: returned workspace_id must equal the connection's project, else EXTERNAL_INVALID.
- Credentials: bridge only receives FLOWLY_TELEMETRY/DO_NOT_TRACK plus process env; no secret is read or stored by Flowly (login stays in the host's mcporter). Not verified: that process.env passes nothing sensitive beyond what the daemon already has.
- Import-before-workspace: not exercised beyond what the unit tests cover; no live run.
- Minor: tapd-mcp.test.ts line 35 passes a JS number literal 1000000042000000123 (already rounded); harmless but not a real precision test of args.

## Cleanup
Temp dir removed; main node_modules intact; no Paseo resources created.
