# Composer experience parity — 2026-11-17

Implementation and acceptance contract: `docs/SESSION-PARITY-SPEC.md`. User references: native toolbar, Add menu above Plus, and unsent images lost after navigation. Native installed version: 0.16.0. No user window or daily project was operated.

| Area | Native / Flowly result |
| --- | --- |
| Add | Same ordered actions: Add image, Add issue or PR, Upload file. Menu anchored above Plus on desktop and compact views. |
| Commands / skills | Session-discovered list (104 entries in this fixture), names/descriptions/kinds, filtering, arrows, Enter/Tab, Escape, IME guard. Selection does not send. |
| Client commands | `/clear` and `/exit` aliases open the exact native composer for review, preserving a nonempty native draft. No automatic archive or prompt. Other plugins' command catalogs and voice remain native-only; no public embed API. |
| Files | Generic chooser, paste and drop, empty MIME fallback, image preservation, byte-exact provider delivery, file/reference queue recovery. No new plugin size/count caps. |
| Draft recovery | Per-session original image/file bytes and reference metadata stored on daemon; Back/reopen, session switch and plugin/browser reload restore. Remove persists; success clears submitted IDs only; failures retain selection with Retry. |

Implementer checks before freeze:

- `npm run typecheck`: exit 0.
- Isolated telemetry-off focused suite: 9 files, 139 passed, exit 0. Includes attachment draft persistence/concurrency/scope/idempotency/missing files, browser file intake, commands, queue/recovery, input, onboarding and all catalog checks.
- `node docs/verification/composer-experience-check.mjs`: exit 0, 30/30 actual checks. Real provider response `PICKER|PASTE|DROP` confirms chooser/paste/drop file bytes; original pasted PNG bytes match daemon draft after reload.
- Screenshot evidence through `docs/promo/shot-lib.mjs`: `composer-experience/flowly-add-menu.png`, `compact-add-menu.png`, `flowly-commands.png`, `flowly-restored-draft.png`. Native baseline in `native-*.png`; the fixture loaded 2 commands and 102 skills. UI checks ran against the installed renderer in an isolated daemon/home with telemetry off.
- Cleanup: fixture board/native registries empty, daemon stopped, browser closed, owned temporary home removed. IDs were recorded before creation in `composer-experience/owned-resources.json`; results in `results.json`.
- Regex design detector: four new UI files scanned, exit 0; this does not establish computed contrast or phone behavior. Desktop/compact screenshots were inspected separately.

Failed attempts: an initial missing Platform import and stale translations failed type/catalog checks; fixed, complete focused group rerun. A native-command UI wait failed because the exact native pane was not opened after setting its prompt; fixed, complete UI sequence rerun. All failed-run fixture cleanup completed. A small final motion/blur-forwarding follow-up is included in the frozen candidate and checked separately below.

Final exact-commit checks and independent evidence are appended after freeze. Phone/Android, live authenticated Forge result selection, and other plugins' native-only commands were not exercised. Server Forge mapping/error/scope tests cover its contract; opening the actual picker was exercised. No new telemetry field, dependency, version, or What's new entry. Files and commands tour/tip and README cover the new input actions; persistence repairs expected draft behavior and needs no additional tip.


## Final frozen result

- Product commit: `b9fa8ed33d297df1da3d6eef4be411ce85e7b284`. Implementer: `npm run typecheck` exit 0; full focused group with `server/native-session.test.ts` added: 10 files / 145 passed, exit 0; `npm test -- --maxWorkers=2` exit 0, 180 files passed / 2 skipped, 1710 tests passed / 8 skipped. No assertions or test timeouts changed.
- Independent `codex/gpt-6-luna`, native session `08e117fa-11a0-47cc-ba56-17356cb478ce`, full-access: typecheck, same 145 focused tests and default `npm test` all passed on the same commit (1710 passed / 8 skipped). See the verifier-owned `composer-experience-independent.md`; implementation did not edit that evidence.
- Exact-commit installed-host UI: final run exit 0, 30/30 checks, no page errors; snapshots and `results.json` now reflect this run. Full cleanup confirmed: board/native registries empty, isolated daemon stopped, browser closed and owned temporary home removed. This includes reload restore, per-session isolation, removal persistence and a real byte-exact provider reply.
- A prior exact-commit attempt needed its ignored `.test-data` parent created before launch; no native resource was created in that failed setup. Another attempt reached draft restoration but the native provider reported `Timed out closing previous session during refresh`; the send failed and the draft remained. The complete final sequence passed after this failed run's fixture was cleaned. The original default-concurrency unit run had 22 timeouts plus one new empty-argument mock failure. The mock regression was fixed; reduced-concurrency implementer and default-concurrency independent reruns both passed. The verifier compared the earlier failure identities against the original parent.
- The installed daily Flowly directory was verified to be the shared repository, typechecked and reloaded with `paseo plugin reload flowly` (exit 0, running). No daemon or other plugin was restarted and no user window was operated. This status alone is not UI proof; actual UI evidence comes only from the owned isolated fixture above.
- PR: https://github.com/FengLvv/flowly/pull/9 . Remote CI and CodeRabbit currently return no run/status/review; no protection bypass or merge was attempted. An unauthenticated GitHub check request was rate-limited (403); connector reads succeeded but returned empty results. Phone and authenticated live Forge selection remain unrun.

- Final cleanup: implementer detached checkout removed after copying owned evidence; verifier-owned checkouts/homes removed by the verifier. The idle verifier agent was positively matched by parent/session/workspace ownership labels and then hard-deleted by exact ID (deletedCount 1). Other native sessions and existing worktrees were preserved.
