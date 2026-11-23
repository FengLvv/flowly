# Card supplements

## Interaction

- The forms and card sidebar show **Supplemental notes** below the description and its images. Initially the list shows its existing entries and **Add note**. Clicking **Add note** opens and focuses one single-line field below the list. Add or Enter submits that entry and closes the field on success. Cancel closes the entry without adding anything. Click **Add note** again for another entry.
- Forms add an entry to the draft list and commit the list on Save. Save includes any nonblank text still in the open input. The form can remove listed draft items before saving.
- The sidebar supports direct additions even when the card description is empty. Its field and actions are disabled while saving. An error leaves the field open with the text available to retry. Previously saved multiline entries keep their line breaks.
- In the sidebar, each saved note has a Remove note button. It saves immediately and leaves the other entries in order. An open Add note draft stays available while a different entry is removed. The visible remove control needs no separate onboarding tip.
- Archived cards and archived projects show existing notes read-only. The sidebar uses the same layout on desktop and compact screens. Switching cards closes the input.
- A card description is rendered once as detail data refreshes, while the notes editor keeps its own identity and draft for that card.

## Data and errors

- Each task can store an ordered, optional `supplements: { id: string, text: string }[]` in the existing task record, including in board reads and project snapshots. Missing or empty means an empty list. IDs are unique per card and at most 200 characters. Text is trimmed at entry, is nonempty and supports line breaks. Each card accepts up to 50 items of up to 2,000 characters each. Identical text can appear in distinct entries.
- The bound agent can read the saved list in `flowly_get_task`. Adding a note updates the card only.
- `tasks.create` and `tasks.update` optionally accept the list. Update replaces it under the existing task revision check, and omission preserves it. `tasks.supplements.append` takes the task ID and one entry. It validates the live card and its project and serializes the addition with all other writes. Replaying an already saved entry ID with identical text returns the current task without a write. Reusing that ID with different text is rejected. Each actual append increments the task revision and records a human edit. If concurrent clients append distinct entries, both are kept in commit order. A stale form receives the existing revision error.
- Blank drafts do not add entries. At the item limit the input is disabled with an explanation. Missing and archived cards, stale form revisions, invalid fields and storage failures never overwrite existing card content. The list is card content and follows the normal card lifecycle.
- Sidebar removal uses `tasks.update` with the current card revision and the list after removing the selected ID. The server rejects a stale revision, and the sidebar refreshes before the user retries. Deleting the last entry removes the stored list field.

## Acceptance

1. Create and edit a card with several notes. Verify the field starts hidden, opens as one line, and closes after Add or Cancel. Reopen to check saved order and removed entries.
2. Append and remove notes directly from the desktop and compact sidebar. Verify each successful addition closes the field. After a removal, reopen the card and Edit to check the remaining list and its order.
3. Reopen an older card and reload persisted records. Concurrent appends are kept, retries are idempotent, and stale forms cannot erase appended notes.
4. Blank, oversized and duplicate-ID input is handled as specified. An archived card is read-only and a failing sidebar save keeps the current draft available for retry.
