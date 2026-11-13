# Card description images

Approved scope: 2026-11-12. A description is Markdown text followed by a list of
managed images. New task and Edit task support paste, drop and Add images on
web/desktop; saved images can be viewed, enlarged and removed on every platform.
Phones have no new picker (SESSION-PANE-SPEC §6). No inline image editor or
automatic remote-image download is introduced.

## Contract

- PNG/JPEG/GIF/WebP images have no Flowly-imposed count, byte-size or pixel-size
  limit (user decision 2026-11-13). This applies to descriptions, first instructions,
  follow-ups and queued messages. Images keep their original bytes; Flowly does
  not resize, compress, truncate or silently drop them. Host, provider, available
  memory and transport constraints still apply and failures remain visible.
  The daemon validates nonempty canonical base64 and file signature, not just
  the supplied MIME; saved images retain membership, size and hash integrity checks.
- `Task.descriptionImages?` contains ordered `{id, name, mimeType, bytes, sha256}`
  metadata, never image data. Absent means empty, preserving existing cards.
  Task create accepts new image payloads; task edit accepts new payloads or IDs
  already belonging to that card. Omitted edit field preserves the list, `[]`
  clears it. The existing task revision guards text and images together.
- Daemon files are immutable under `description-images/`. Writes complete before
  the card commits, and the card commits before an optional first session starts.
  Failed attempts clean only their own unreferenced files. A saved card remains
  available if starting its session fails. Existing workspace recovery is unchanged.
- Reads use task ID, revision and image ID, never caller-supplied paths. Every
  read checks current membership and file integrity. Image bytes load on demand,
  not in board/overview polling, tool context or system prompts.
- Archive and wrap up preserve images. Removed/replaced images remain immutable
  backup assets: SQLite backups, JSON exports and `removed/` records can still
  reference them. Permanent card/project deletion removes live access, not backup
  bytes, consistent with retaining the record backup. Project folder snapshots
  copy referenced files into `.flowly/description-images/` before publishing
  `project.json`; restore validates/imports those files before restoring records.
  Missing files fail visibly rather than silently dropping images.

## Use card description

Both New task → Start an agent now and New session offer **Use card description**
when text or images exist. This explicit action replaces the first instruction
with a copy of the description and its image list. The user can edit the text,
remove images or add others; this never edits the card. Repeating the action
reloads the description. Custom instructions still start empty (amends
UI-REFRESH-SPEC §7s). An image-only instruction is allowed; include the card title
as its text when sending. Copy and submission preserve every selected image in
order, including more than four images and files larger than 5 MiB.

In both launch forms, place this action below the instruction field, at the
trailing edge of the image-attachment controls, rather than above the field as a
full-width button. Keep the existing quiet button styling. At narrow widths the
controls may wrap without overflowing; the description action remains available
on phones even though their image picker is unavailable.

For an existing card the action reads fresh text/metadata/bytes with one revision.
Before session creation, recheck that revision; stale data requires reloading the
description. A new task tracks its local description snapshot and requires
reloading if that description changes. Actual bytes go to SDK `agents.create`
`images`, with a stable message ID. Retries recover an existing prepared session
without resending its first message. Provider errors keep the dialog contents;
missing/corrupt images block taking the snapshot. Ordinary follow-ups still send
exactly the user's text. New/changed descriptions do not send messages on their own.

## Guidance and telemetry

Add a one-time `description-images` tip on an open card, and a More features tour
entry. Update README and all interface catalogs; no What's new or version bump.
The 2026-11-13 `image-limits` tip announces the removed caps once on an open card;
the tour and README clarify that host and model constraints still apply.
No new heartbeat fields: existing session creation counts already cover the
action. Image bytes, names and paths never become telemetry properties.

## Acceptance

1. Create/edit text and pictures, reopen after daemon restart, and view them on
   desktop and compact layouts; old cards remain editable without migration loss.
2. Use description in both launch forms; preview/edit/remove the copied material;
   verify a real agent receives and identifies the actual image. Custom and
   ordinary follow-up instructions retain their existing behavior.
3. Accept more than four images and files above 5 MiB; reject invalid type/base64,
   foreign IDs/corrupt files and stale edits; preserve
   drafts, old card state and startup idempotency on failures.
4. Verify image-only launches, complete copied image lists, snapshot restore and historical
   backup image availability after replacement/deletion; clean owned fixtures.
5. Run typecheck and full tests, including focused daemon, launch and onboarding
   coverage. Record UI, runtime and independent checks separately from static tests.
