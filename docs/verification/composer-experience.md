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
