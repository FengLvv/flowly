# Card supplements

## Interaction

- The forms and card sidebar show **Supplemental notes** below the description and its images. Initially the list shows its existing entries and **Add note**. Clicking **Add note** opens and focuses one single-line field below the list. Add or Enter submits that entry and closes the field on success. Cancel closes the entry without adding anything. Click **Add note** again for another entry.
- Each entry can contain text, images, or both. With the input open, desktop and web support the same file picker, paste and drop as card description images. Saved images show beneath the entry text and open a larger preview. Phones can view and remove saved images and edit the text.
- Each entry has Edit note and Remove note controls. Edit opens the entry in place with its current text and images. The field is single-line for new entries; legacy multiline text remains editable with its line breaks. Cancel discards the edit. Saving keeps the same entry ID and position.
- Forms apply added, edited and removed entries to the draft list and commit the list on Save. Form Save also includes a valid open draft. An empty edit must be cancelled or filled before saving; remove the entry explicitly to delete it.
- The sidebar supports direct additions even when the card description is empty. Its field and actions are disabled while saving. An error leaves the field open with the text available to retry. Previously saved multiline entries keep their line breaks.
- Sidebar edits and removals save immediately and leave the other entries in order. An open draft stays available while a different entry is removed. If the entry being edited changes or is removed elsewhere, the draft stays open and the user must reopen the entry before applying their changes.
- Archived cards and archived projects show existing notes read-only. The sidebar uses the same layout on desktop and compact screens. Switching cards closes the input.
- A card description is rendered once as detail data refreshes, while the notes editor keeps its own identity and draft for that card.

## Data and errors

- Each task can store an ordered, optional `supplements: { id: string, text: string, images?: ImageMetadata[] }[]` in the existing record, including board reads and project snapshots. Missing or empty means an empty list. IDs are unique per card and at most 200 characters. Text is trimmed, supports line breaks and can be empty when an image is present. Each card accepts up to 50 entries of up to 2,000 characters each. Existing text-only entries need no migration.
- Images reuse the immutable files, supported formats, byte integrity checks and retention policy from [Card description images](DESCRIPTION-IMAGES-SPEC.md). Card writes commit text and image metadata together after the files are saved. Failed writes clean their new unreferenced files. An existing image ID can be kept only on its original entry. Reads require the current card revision and both the entry and image IDs. Project snapshots copy these files on export and restore. Tool context carries metadata only; card description copy always uses description images only.
- The bound agent can read the saved list in `flowly_get_task`. Adding a note updates the card only.
- `tasks.create` and `tasks.update` optionally accept the list. New images carry name, MIME type and data; edits can also keep existing image IDs. Update replaces the list under the existing task revision check, and omission preserves it. `tasks.supplements.append` takes the task ID and one entry with optional new images. It validates the live card and its project and serializes with other writes. Replaying an entry ID with identical text and the same ordered image contents, names and MIME types returns the current task without a write. Reusing the ID with different content is rejected. Concurrent distinct entries are kept in commit order.
- Blank drafts do not add entries. At the item limit the input is disabled with an explanation. Missing and archived cards, stale form revisions, invalid fields and storage failures never overwrite existing card content. The list is card content and follows the normal card lifecycle.
- Sidebar edit and removal use `tasks.update` with the current card revision and the list after changing only the selected ID. The server rejects a stale revision, and the sidebar refreshes before the user retries. Deleting the last entry removes the stored list field.

## Acceptance

1. Create and edit a card with text-only, image-only and mixed notes. Check the one-line add, Cancel, image preview, and saving the open draft with the card.
2. Add, edit and remove entries directly from the desktop and compact sidebar. Reopen the card and Edit to check saved text, images, order and stable IDs.
3. Reopen an older card and restore a snapshot. Concurrent appends are kept, retries are idempotent, and stale edits cannot erase newer changes.
4. Reject blank and oversized entries, invalid images, duplicate entry IDs and out-of-scope image IDs. An archived card is read-only and a failing save keeps the draft available for retry.
