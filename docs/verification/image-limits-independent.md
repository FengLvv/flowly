# Image limits removal: independent verification

Verifier session: `c948d8d1-c094-4bea-befd-d05dce34929d` (independent tester; did not write the code). Session ID and permission mode were taken from the parent's correction message, not checked independently: the session ran in `bypassPermissions` mode. Model requested: `claude/claude-haiku-5-5`; the model actually used was not verified in this session.

## Scope and method

- Candidate: `000bc78f3e7dcdb01fb93914113258861b30bb1d` (`feat(images): remove attachment count and size caps`).
- Integration baseline (direct parent): `4465a2498ed0203dc29b6a02c3d9c5c82f620d57`.
- Both trees were made with `git archive` into `.test-data/image-limits-independent-20261113105501-30621/{candidate,baseline}`. This is an **archive snapshot**, not a `git worktree`. Each snapshot has a `node_modules` directory junction to the shared root `node_modules`. The shared working tree (HEAD `79752aa`, with other sessions' edits) was not modified or used as the test tree.
- Environment for every command: `NODE_ENV=test FLOWLY_TELEMETRY=0`.

## Commands and results

| Check | Tree | Command | Exit | Result |
|---|---|---|---|---|
| Typecheck | candidate | `npm run typecheck` | 0 | clean |
| Focused | candidate | `npx vitest run client/web-images.test.ts shared/description-images.test.ts server/description-images.test.ts server/composer.test.ts client/onboarding-logic.test.ts shared/i18n.test.ts client/session.test.ts --testTimeout=15000` | 0 | 7 files, 123/123 passed |
| Full | candidate | `npx vitest run --testTimeout=15000 --exclude 'docs/verification/**' --exclude '.claude/**' --reporter=json` (the `npm test` command) | 1 | 1397 tests: 1361 passed, 29 failed, 7 pending; 300 suites, 19 failed suites |
| Full | baseline | same command | 1 | 1392 tests: 1355 passed, 30 failed, 7 pending; 299 suites, 19 failed suites |

## Failure identity comparison (full runs)

- The failing test sets were compared by file and full test name from the JSON reports. There were no file-level (collection) errors on either tree.
- **Uncaught errors: not recorded.** The full-run logs and JSON reports were deleted during cleanup, so the count of uncaught errors (the two Windows Unix-socket errors reported in the earlier run) was not independently recorded and cannot be read back. It is not treated as zero.
- **Common to both trees: 29 failing tests**, the same identities, across 19 suites. These are unrelated to image handling (for example `server/error-report.test.ts`, `server/local-daemon.test.ts`, `server/project-skills.test.ts`, `server/connectors/jira.test.ts`, `client/catalog.test.ts`). They look like Windows path, symlink, or environment issues, but the cause was not investigated.
- **Baseline only: 1 test.** `server/auto-review.test.ts :: linked root: commands run only in the repositories this delivery changed, all of them when none did (§6.3)` fails on the baseline and passes on the candidate. It is outside the image change. It may be flaky or environment-dependent; I did not rerun it to determine which.
- **Candidate only: 0 tests.**
- The difference in the 29 common failures is therefore nil. The candidate does not add a new failure. The baseline's extra failure is not explained, and I did not confirm that it is flaky.

## Static checks on the candidate (exact snapshot)

- No remaining references to `maxImages`, `maxImageBytes`, `.full`, or the old `readImages(files, room)` signature in `*.ts`/`*.tsx`.
- Oversize and count caps are gone from the schemas: `outgoingImageSchema`, `descriptionImageSchema.bytes`, `descriptionImageInputsSchema`, `queuedMessageSchema.images`. Only length limits on text, IDs and similar fields remain.
- `readImages` no longer drops files over `room` or over 5 MB. Files are read one at a time, in order (no unbounded parallel `FileReader`s). Unsupported MIME types are still reported.
- `ImageAttachments` / `useImageAttachments` no longer disable the picker at a limit, and no longer throw from `replace`.
- Description image integrity is still checked. `server/description-images.ts:76` compares the stored `sha256` with the file bytes and rejects a mismatch. The `lstat` size check that compares `info.size` with `image.bytes` remains (line 73). Only the `maxImageBytes` guard was removed.
- Image recovery path: `DescriptionImageFiles` and `session-preview.tsx` contain no `slice`/`splice` on image arrays. The only `.slice` in the client image path is `client/web-images.ts:47`, which strips the data-URI prefix. Nothing discards images on a failed send.

## Risks noted (not failures)

- The removed server-side caps mean a request can now carry an arbitrarily large body. The JSON body limit and the daemon's own RPC handling are the only remaining bounds. I did not measure memory use at large sizes.
- Covered (not a gap): `server/description-images.test.ts`, test "more than four images including one above 5 MiB persist, reload, edit and snapshot intact" (`git show 000bc78:server/description-images.test.ts`). It creates eight images, one over 5 MiB, through `createTask`. It reads them back through a fresh `BoardStore`/`DescriptionImages` (reload), adds a ninth image through `editTask`, and checks the folder snapshot. It also restores the snapshot into a new data directory and checks every image. Each image is compared by name, MIME type, exact base64 data and byte length. That test passed in the candidate full run (it is not among the 29 failures).
- Not covered and not measured: memory use and latency when many large images (for example 4 or more at tens of MB each) are sent, stored, snapshotted or sent to the model. The 5 MiB case is the largest one tested.
- Not covered: real model or host behaviour with images above their own limits. The app now defers to them. That was not tested against any real model or provider.

## Unrun / boundaries

- No UI, no plugin install or reload, no daemon interaction, no user data touched.
- Not run: a baseline-vs-candidate rerun of the single flaky-looking auto-review test; a Windows-specific investigation of the 29 shared failures; a recorded count of uncaught errors in the full runs; any real-model or phone check.
- This report covers the archive snapshot of `000bc78`. It does not claim a `git worktree` was used.
