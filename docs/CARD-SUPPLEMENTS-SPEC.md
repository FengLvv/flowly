# Card supplements

## Interaction

- New task and Edit task show **Supplemental notes** directly below the description and its images. Add adds the current text to the draft list. Save also includes text still in the input. The form can remove any listed draft item before saving, and Cancel discards form changes.
- The card sidebar shows the same list directly below the description and images, before the configurable sections. It remains available on a card with no description. Add saves immediately and clears the field after confirmation. Enter adds and Shift+Enter inserts a new line on web. While a save is in progress, the sidebar input and Add are disabled. An error appears beside the input and leaves the text available to retry.
- Archived cards and archived projects show existing notes read-only. The sidebar uses the same layout on desktop and compact screens. Switching cards starts with an empty input.

## Data and errors

- Each task can store an ordered, optional `supplements: { id: string, text: string }[]` in the existing task record, including in board reads and project snapshots. Missing or empty means an empty list. IDs are unique per card and at most 200 characters. Text is trimmed at entry, is nonempty and supports line breaks. Each card accepts up to 50 items of up to 2,000 characters each. Identical text can appear in distinct entries.
- The bound agent can read the saved list in `flowly_get_task`. Adding a note updates the card only.
- `tasks.create` and `tasks.update` optionally accept the list. Update replaces it under the existing task revision check, and omission preserves it. `tasks.supplements.append` takes the task ID and one entry. It validates the live card and its project and serializes the addition with all other writes. Replaying an already saved entry ID with identical text returns the current task without a write. Reusing that ID with different text is rejected. Each actual append increments the task revision and records a human edit. If concurrent clients append distinct entries, both are kept in commit order. A stale form receives the existing revision error.
- Blank drafts do not add entries. At the item limit the input is disabled with an explanation. Missing and archived cards, stale form revisions, invalid fields and storage failures never overwrite existing card content. The list is card content and follows the normal card lifecycle.

## Acceptance

1. Create and edit a card with several notes. Reopen to check order, multiline text and removed entries.
2. Append directly from the desktop and compact sidebar, including when the description is empty. Open Edit and check the same list.
3. Reopen an older card and reload persisted records. Concurrent appends are kept, retries are idempotent, and stale forms cannot erase appended notes.
4. Blank, oversized and duplicate-ID input is handled as specified. An archived card is read-only and a failing sidebar save keeps the current draft available for retry.
