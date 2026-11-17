import { expect, test, vi } from "vitest";
import { AttachmentDraft, type AttachmentDraftIO } from "./attachment-draft";
import type { DraftAttachment } from "../shared/attachment-drafts";
const image: DraftAttachment = { id: "image", kind: "image", name: "original.png", mimeType: "image/png", data: "cG5n" };
const file: DraftAttachment = { id: "file", kind: "file", name: "notes.txt", mimeType: "text/plain", data: "dGV4dA==" };
function fixture() {
  let items: DraftAttachment[] = [], revision = 0;
  const io: AttachmentDraftIO = {
    read: vi.fn(async () => ({ items: [...items], revision })),
    add: vi.fn(async (added: DraftAttachment[]) => { items = [...items, ...added.filter(item => !items.some(old => old.id === item.id))]; return { revision: ++revision }; }),
    remove: vi.fn(async (ids: string[]) => { items = items.filter(item => !ids.includes(item.id)); return { revision: ++revision }; }),
  };
  return { owner: new AttachmentDraft(io), io, items: () => items };
}
const finish = async (owner: AttachmentDraft) => { await vi.waitFor(() => expect(owner.snapshot().saving).toBe(false)); };

test("session owner retains bytes without subscribers; a new owner hydrates daemon state", async () => {
  const x = fixture(); await x.owner.load();
  const unsubscribe = x.owner.subscribe(() => {});
  x.owner.add([image, file]); unsubscribe(); await finish(x.owner);
  const reopened = new AttachmentDraft(x.io); await reopened.load();
  expect(reopened.snapshot().items).toEqual([image, file]); expect(reopened.ready()).toBe(true);
});
test("failed save remains retryable with original bytes and blocks send", async () => {
  const x = fixture(); await x.owner.load(); vi.mocked(x.io.add).mockRejectedValueOnce(new Error("offline"));
  x.owner.add([image]); await vi.waitFor(() => expect(x.owner.snapshot().error).toBe("offline"));
  expect(x.owner.ready()).toBe(false); expect(x.owner.snapshot().items).toEqual([image]);
  await x.owner.retry(); expect(x.owner.ready()).toBe(true); expect(x.items()).toEqual([image]);
});
test("send failure restores attachments even after unsubscribe; acknowledgement only removes submitted IDs", async () => {
  const x = fixture(); await x.owner.load(); x.owner.add([image]); await finish(x.owner);
  const submitted = x.owner.detach()!; expect(x.items()).toEqual([image]);
  x.owner.add([file]); await finish(x.owner); x.owner.restore(submitted); await finish(x.owner);
  expect(x.owner.snapshot().items).toEqual([file, image]);
  const again = x.owner.detach()!; const later = { ...file, id: "later" }; x.owner.add([later]);
  x.owner.acknowledge(again); await finish(x.owner);
  expect(x.items()).toEqual([later]); expect(x.owner.snapshot().items).toEqual([later]);
});
test("an older hydration cannot resurrect acknowledged or locally removed IDs", async () => {
  const x = fixture(); await x.owner.load(); x.owner.add([image]); await finish(x.owner);
  let resolve!: (value: { items: DraftAttachment[]; revision: number }) => void;
  vi.mocked(x.io.read).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const read = x.owner.load(true); x.owner.remove([image.id]); await finish(x.owner);
  resolve({ items: [image], revision: 1 }); await read;
  expect(x.owner.snapshot().items).toEqual([]);
});
test("missing bytes remain visible/removable and cannot be sent", async () => {
  const x = fixture(); vi.mocked(x.io.read).mockResolvedValueOnce({ items: [{ ...image, data: null }], revision: 1 });
  await x.owner.load(); expect(x.owner.snapshot().items).toHaveLength(1); expect(x.owner.ready()).toBe(false);
  x.owner.remove([image.id]); await finish(x.owner); expect(x.owner.ready()).toBe(true);
});
test("hydration merges local additions and does not start binary polling", async () => {
  const x = fixture(); await x.owner.load(); x.owner.add([image]); await finish(x.owner);
  await x.owner.load(); await x.owner.load(); expect(x.io.read).toHaveBeenCalledTimes(1);
});
