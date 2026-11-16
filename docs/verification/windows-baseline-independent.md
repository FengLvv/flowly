# Independent Windows baseline verification

- Candidate: `c501a4e80d1055fe034202c1cb697d00f80d8604` (exact baseline `a06159092cc444105af181e9858fabdfc8007bca`)
- Verifier: `codex/gpt-6-luna`, full-access as instructed. Paseo session ID: `1f919658-edd8-4896-8836-5cdd59ba3613`.
- Checkout: `.test-data/windows-gate-verifier-b9490`; tracked source was clean at start. Fresh `npm ci --no-audit --no-fund` exited 0. Telemetry remained disabled by test setup. No native Paseo resources or daily daemon data were accessed.

## Checks

| Command | Exit | Result |
| --- | ---: | --- |
| `npm ci --no-audit --no-fund` | 0 | 368 packages installed in the isolated checkout |
| `npm run typecheck` | 0 | Passed |
| `npm test -- client/catalog.test.ts server/agent-service.test.ts server/artifacts.test.ts server/auto-review.test.ts server/connectors/jira.test.ts server/error-report.test.ts server/local-daemon.test.ts server/naming.test.ts server/project-folder.test.ts server/project-skills.test.ts server/session-images.test.ts server/skill-source.test.ts server/tool-server.test.ts server/usage.test.ts server/workflow-insights.test.ts shared/images.test.ts server/testing server/linked-projects.test.ts server/project-remove-paseo.test.ts server/paseo-cli.test.ts` | 0 | 21 files; 258 passed, 0 failed, 0 skipped |
| `npm test` | 0 | 160 files passed, 1 skipped; 1431 passed, 0 failed, 7 skipped |
| `npm run test:ci` | 0 | 4 passed, 0 failed, 0 skipped |
| `npm pack --dry-run` | 0 | 299 package files; no `server/testing` helpers included |

Baseline comparison uses `docs/verification/windows-baseline-results.json`: all 34 exact baseline failure identities (baseline 1377 passed / 34 failed / 7 skipped) are absent from the candidate full run, and the candidate failure set is empty. The same seven tests remain skipped; no timeout or skip change was observed.

## Review and limits

Reviewed the candidate diff and relevant specs. Drive, UNC and file URL image cases retain rejection of relative/device/invalid references; session image reads still require task ownership, matching workspace, transcript membership, image type and file existence. Error frames are normalized and bounded to the plugin root with traversal/sibling/node_modules redaction. Private writes assert requested `0600` on Windows and actual mode on POSIX. Local daemon fixtures use unique named pipes on Windows and distinguish refused transport from authentication refusal. Git fixtures use a test-owned global config and fixed author/committer dates. No High or Medium defect found.

No live daemon/UI or remote UNC access was exercised; Windows ACLs were not audited (mode bits are not ACL evidence). No native CLI writes were performed. These are outside the requested isolated test gate.

**Verdict: PASS.** Owned temporary paths: `F:\Project\Paseo_plugins\Flowly\.test-data\windows-gate-verifier-b9490` (including its isolated `node_modules` and test-owned fixture home, removed by the test harness). No other persistent files were created by this verifier except this report.

