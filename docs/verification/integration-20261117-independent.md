# Independent integration verification

- Session: `84bbbd10-8086-4be4-8268-802f8075c15a` (`codex/gpt-6-luna`, full-access)
- Candidate: `728570d95e6b375eb9bd746e8e147f06e2ea5ac9` (detached worktree)
- Environment: Windows, Node 24.13.0; private `PASEO_HOME`; `NODE_ENV=test`, telemetry disabled.

## Checks

| Command | Result |
| --- | --- |
| `npm ci` | exit 0; 368 packages installed. npm reported 4 moderate audit advisories. |
| `npm run typecheck` | exit 0. |
| Focused 23-file Vitest command from the integration request | exit 0; 23 files passed, 348 tests passed. |
| `npm test` | exit 0; 176 files passed, 2 skipped; 1,686 tests passed, 8 skipped (1,694 total). |
| `npm run test:ci` | exit 0; 4 passed, 0 failed. |
| `npm run ci:package` | exit 1; `server/ci/common.mjs` failed with `spawnSync npm ENOENT` on Windows while invoking `npm pack`. Packaging check is unverified on this platform. |

No High or Medium product defect was reproduced by these checks. I did not run desktop UI, phone/device, native Paseo resource, or live agent-message verification; upstream reports are not evidence for this candidate's live behavior. The candidate integration spec and captured-ref manifest were inspected; this run found no omitted branch feature to report, but it does not establish GitHub PR/merge/push state.

A first full-suite invocation lost its terminal handle before the final status could be captured. The authoritative repeat above completed cleanly and supplies the reported counts.

## Verifier cleanup status

Cleanup was attempted for the verifier-owned worktree `F:\Project\Paseo_plugins\Flowly\.test-data\integration-20261117\verifier\checkout` using `git worktree remove`, followed by recursive removal of `F:\Project\Paseo_plugins\Flowly\.test-data\integration-20261117\verifier` (which contains the private `paseo-home`). The tool rejected the combined command before execution with the original reason: `CreateProcess ... Rejected("... rejected: blocked by policy")`; it provided no more specific reason. No deletion occurred. I stopped immediately and did not retry with another command or tool.

Still retained: the registered detached Git worktree at `...\verifier\checkout`, its installed `node_modules`, and the verifier-owned `...\verifier\paseo-home` directory. These are the only verifier resources left; the report is preserved separately in `docs/verification/`.
