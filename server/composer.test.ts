import { afterEach, expect, test, vi } from "vitest";
import type { PaseoApi } from "@getpaseo/client";
import { mkdtemp, realpath, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BoardStore } from "./store";
import { ComposerService, ComposerStore } from "./composer";
import { queueMessage } from "../shared/rpc";
import type { DraftAttachment } from "../shared/attachment-drafts";

const draftImage: DraftAttachment = { id: "original-image", kind: "image", name: "original.png", mimeType: "image/png", data: Buffer.from("original-png-bytes").toString("base64") };

test("attachment drafts preserve image/file/reference bytes across reload without embedding bytes in composer reads", async () => {
  const x = await setup();
  const items: DraftAttachment[] = [draftImage, { id: "text", kind: "file", name: "draft.txt", mimeType: "text/plain", data: "dGV4dA==" }, { id: "issue", kind: "reference", reference: { type: "forge_issue", mimeType: "application/paseo-forge-issue", forge: "github", number: 1, title: "Issue", url: "https://example.com/issue/1" } }];
  await x.service.addAttachments({ taskId: "t", agentId: "a", items }, x.paseo);
  const reloaded = new ComposerService(new ComposerStore(x.board.directory), x.board);
  expect(await reloaded.readAttachments({ taskId: "t", agentId: "a" }, x.paseo)).toEqual({ items, revision: 1 });
  expect(JSON.stringify(await reloaded.read())).not.toContain(draftImage.data);
  await reloaded.removeAttachments({ taskId: "t", agentId: "a", ids: [draftImage.id] }, x.paseo);
  expect((await reloaded.readAttachments({ taskId: "t", agentId: "a" }, x.paseo)).items).toEqual(items.slice(1));
});
test("attachment add is idempotent and duplicate IDs create only one owned file", async () => {
  const x = await setup();
  await x.service.addAttachments({ taskId: "t", agentId: "a", items: [draftImage, draftImage] }, x.paseo);
  await x.service.addAttachments({ taskId: "t", agentId: "a", items: [draftImage] }, x.paseo);
  const { readdir } = await import("node:fs/promises");
  expect(await readdir(x.service.store.imageDirectory)).toHaveLength(1);
  expect((await x.service.readAttachments({ taskId: "t", agentId: "a" }, x.paseo)).items).toEqual([draftImage]);
});
test("concurrent add and clearing submitted IDs preserves a later attachment", async () => {
  const x = await setup(), later = { ...draftImage, id: "later" };
  await x.service.addAttachments({ taskId: "t", agentId: "a", items: [draftImage] }, x.paseo);
  await Promise.all([x.service.addAttachments({ taskId: "t", agentId: "a", items: [later] }, x.paseo), x.service.removeAttachments({ taskId: "t", agentId: "a", ids: [draftImage.id] }, x.paseo)]);
  expect((await x.service.readAttachments({ taskId: "t", agentId: "a" }, x.paseo)).items).toEqual([later]);
});
test("missing attachment bytes stay recorded and removable", async () => {
  const x = await setup(); await x.service.addAttachments({ taskId: "t", agentId: "a", items: [draftImage] }, x.paseo);
  const stored = (await x.service.read()).sessions.a.draftAttachments![0];
  if (stored.kind === "reference") throw new Error("expected file");
  await rm(join(x.service.store.imageDirectory, stored.file));
  expect((await x.service.readAttachments({ taskId: "t", agentId: "a" }, x.paseo)).items).toEqual([{ ...draftImage, data: null }]);
  await x.service.removeAttachments({ taskId: "t", agentId: "a", ids: [stored.id] }, x.paseo);
  expect((await x.service.read()).sessions.a.draftAttachments).toEqual([]);
});
test("attachment writes reject wrong, archived and unavailable sessions before file writes", async () => {
  const x = await setup(); const spy = vi.spyOn(x.service.store, "writeFiles");
  x.agent.workspaceId = "other";
  await expect(x.service.addAttachments({ taskId: "t", agentId: "a", items: [draftImage] }, x.paseo)).rejects.toThrow(/different workspace/);
  x.agent.workspaceId = "w"; Object.assign(x.agent, { archivedAt: "now" });
  await expect(x.service.addAttachments({ taskId: "t", agentId: "a", items: [draftImage] }, x.paseo)).rejects.toThrow(/archived/);
  Object.assign(x.agent, { archivedAt: null, providerUnavailable: true });
  await expect(x.service.removeAttachments({ taskId: "t", agentId: "a", ids: [draftImage.id] }, x.paseo)).rejects.toThrow(/unavailable/);
  expect(spy).not.toHaveBeenCalled();
});
test("scope change during byte preparation rejects commit and removes just-prepared files", async () => {
  const x = await setup(), write = x.service.store.writeFiles.bind(x.service.store);
  vi.spyOn(x.service.store, "writeFiles").mockImplementation(async files => { const result = await write(files); x.agent.workspaceId = "other"; return result; });
  await expect(x.service.addAttachments({ taskId: "t", agentId: "a", items: [draftImage] }, x.paseo)).rejects.toThrow(/different workspace/);
  const { readdir } = await import("node:fs/promises");
  expect(await readdir(x.service.store.imageDirectory)).toEqual([]); expect((await x.service.read()).sessions).toEqual({});
});

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function setup(status = "running") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ultra-composer-")));
  roots.push(root);
  const board = new BoardStore(join(root, "data"));
  const now = new Date().toISOString();
  await board.mutate((b) => {
    b.projects.push({ id: "p", paseoProjectId: "n", title: "P", description: "", primaryPath: root, repos: [root], revision: 1, createdAt: now, updatedAt: now, archivedAt: null });
    b.tasks.push({ id: "t", projectId: "p", workspaceId: "w", sourcePath: root, repoPaths: [root], title: "T", description: "", status: "todo", priority: "normal", position: 0, revision: 1, operationId: "o", createdAt: now, updatedAt: now, archivedAt: null });
  });
  const agent = { id: "a", workspaceId: "w", status, archivedAt: null, pendingPermissions: [] as unknown[] };
  const paseo = { agents: { ref: () => ({ refresh: async () => ({ agent }) }) } } as unknown as PaseoApi;
  const sent: { text: string; steer: boolean }[] = [];
  const images: unknown[] = [];
  let fail = false;
  let now_ = 1_000_000;
  const service = new ComposerService(
    new ComposerStore(board.directory),
    board,
    async (_p, _id, text, steer, attached) => {
      if (fail) throw new Error("offline");
      sent.push({ text, steer });
      if (attached?.length) images.push(...attached);
    },
    () => now_,
  );
  return { service, paseo, agent, sent, images, setFail: (v: boolean) => (fail = v), tick: (ms: number) => (now_ += ms), board };
}

test("drafts and queued messages persist across a new service instance (plugin reload)", async () => {
  const x = await setup();
  await x.service.saveDraft({ taskId: "t", agentId: "a", text: "half typed" });
  await x.service.push({ taskId: "t", agentId: "a", text: "after this turn" }, x.paseo);
  await x.service.idle();
  const reloaded = new ComposerService(new ComposerStore(x.board.directory), x.board);
  const state = await reloaded.read();
  expect(state.sessions.a).toMatchObject({ draft: "half typed", queue: [{ text: "after this turn" }] });
});

test("queue drains one message per idle turn; running sessions wait", async () => {
  const x = await setup("running");
  await x.service.push({ taskId: "t", agentId: "a", text: "one" }, x.paseo);
  await x.service.push({ taskId: "t", agentId: "a", text: "two" }, x.paseo);
  await x.service.idle(); // pushes trigger a background drain check
  expect(await x.service.drain("a", x.paseo)).toBe(false);
  x.agent.status = "idle";
  expect(await x.service.drain("a", x.paseo)).toBe(true);
  expect(await x.service.drain("a", x.paseo)).toBe(false); // cooldown: next turn
  x.tick(10_000);
  expect(await x.service.drain("a", x.paseo)).toBe(true);
  expect(x.sent).toEqual([{ text: "one", steer: false }, { text: "two", steer: false }]);
  expect((await x.service.read()).sessions.a).toBeUndefined();
});

test("send now steers the running turn; failures go back to the front with an error", async () => {
  const x = await setup("running");
  const a = await x.service.push({ taskId: "t", agentId: "a", text: "first" }, x.paseo);
  await x.service.push({ taskId: "t", agentId: "a", text: "second" }, x.paseo);
  await x.service.idle();
  await x.service.sendNow({ taskId: "t", agentId: "a", id: a.id }, x.paseo);
  expect(x.sent).toEqual([{ text: "first", steer: true }]);
  x.agent.status = "idle";
  x.setFail(true);
  expect(await x.service.drain("a", x.paseo)).toBe(false);
  const entry = (await x.service.read()).sessions.a;
  expect(entry.queue.map((m) => m.text)).toEqual(["second"]);
  expect(entry.lastError).toBe("offline");
  await expect(x.service.sendNow({ taskId: "t", agentId: "a", id: "missing" }, x.paseo)).rejects.toThrow(/already sent/);
});

test("pushes are checked against the card workspace; corrupt files are preserved", async () => {
  const x = await setup();
  x.agent.workspaceId = "other";
  await expect(x.service.push({ taskId: "t", agentId: "a", text: "x" }, x.paseo)).rejects.toThrow(/different workspace/);
  await x.service.idle();
  const store = new ComposerStore(x.board.directory);
  await writeFile(store.path, "{broken");
  await expect(store.read()).rejects.toThrow(/preserved/);
  expect(await readFile(store.path, "utf8")).toBe("{broken");
});

test("entries of archived cards are pruned", async () => {
  const x = await setup("idle");
  await x.service.saveDraft({ taskId: "t", agentId: "a", text: "left over" });
  await x.board.mutate((b) => {
    b.tasks[0].archivedAt = new Date().toISOString();
  });
  await x.service.drainAll(x.paseo);
  expect((await x.service.read()).sessions).toEqual({});
});

test("queued images are kept as daemon files, sent with their message, then deleted", async () => {
  const x = await setup("running");
  const png = { data: Buffer.from("png-bytes").toString("base64"), mimeType: "image/png" as const };
  const item = await x.service.push({ taskId: "t", agentId: "a", text: "", images: [png] }, x.paseo);
  const dir = join(x.board.directory, "composer-images");
  expect(item.images).toEqual([{ file: `${item.id}-0.png`, mimeType: "image/png" }]);
  expect((await readFile(join(dir, `${item.id}-0.png`))).toString()).toBe("png-bytes");
  await x.service.idle();
  x.agent.status = "idle";
  expect(await x.service.drain("a", x.paseo)).toBe(true);
  expect(x.images).toEqual([png]);
  await expect(readFile(join(dir, `${item.id}-0.png`))).rejects.toThrow();
  // Removing a queued message deletes its image too.
  x.agent.status = "running";
  const other = await x.service.push({ taskId: "t", agentId: "a", text: "x", images: [png] }, x.paseo);
  await x.service.remove({ agentId: "a", id: other.id });
  await expect(readFile(join(dir, `${other.id}-0.png`))).rejects.toThrow();
});

test("large image batches survive queue reload and provider failure before a complete retry", async () => {
  const x = await setup("running");
  const images = Array.from({ length: 8 }, (_, i) => ({ data: Buffer.alloc(i ? 3 : 5 * 1024 * 1024 + 1, i + 1).toString("base64"), mimeType: "image/png" as const }));
  const input = queueMessage.input.parse({ taskId: "t", agentId: "a", text: "", images });
  const item = await x.service.push(input, x.paseo);
  await x.service.idle();
  const store = new ComposerStore(x.board.directory);
  expect((await store.read()).sessions.a.queue[0].images).toHaveLength(8);
  expect(await store.readImages(item.images)).toEqual(images);
  x.setFail(true);
  await expect(x.service.sendNow({ taskId: "t", agentId: "a", id: item.id }, x.paseo)).rejects.toThrow("offline");
  expect(await store.readImages((await store.read()).sessions.a.queue[0].images)).toEqual(images);
  x.setFail(false);
  await x.service.sendNow({ taskId: "t", agentId: "a", id: item.id }, x.paseo);
  expect(x.images).toEqual(images);
  expect((await store.read()).sessions.a).toBeUndefined();
  await expect(readFile(join(store.imageDirectory, item.images![0].file))).rejects.toThrow();
});


test("generic queued files and issue references survive reload and send failure, then clean up only after success", async () => {
  const x = await setup("running");
  let fail = true;
  const seen: unknown[] = [];
  const files = { prepare: async (_target: unknown, items: { name: string; data: string; mimeType: string }[]) => {
    seen.push(items);
    return items.map(item => ({ type: "uploaded_file" as const, id: "upload", fileName: item.name, mimeType: item.mimeType, size: Buffer.from(item.data, "base64").length, path: "native-owned-upload" }));
  } };
  const send = async (_p: unknown, _id: string, _text: string, _steer: boolean, _images: unknown, _messageId: unknown, attachments: unknown) => { seen.push(attachments); if (fail) throw new Error("offline"); };
  const store = new ComposerStore(x.board.directory), service = new ComposerService(store, x.board, send, undefined, files);
  const reference = { type: "forge_issue" as const, mimeType: "application/paseo-forge-issue" as const, forge: "github", number: 1, title: "Issue", url: "https://github.com/example/repo/issues/1" };
  const item = await service.push({ taskId: "t", agentId: "a", text: "", files: [{ name: "binary.bin", mimeType: "application/octet-stream", data: "AP8B" }], references: [reference] }, x.paseo);
  await service.idle();
  const stored = (await new ComposerStore(x.board.directory).read()).sessions.a.queue[0];
  expect(stored.references).toEqual([reference]); expect(await store.readFiles(stored.files)).toEqual([{ name: "binary.bin", mimeType: "application/octet-stream", data: "AP8B" }]);
  await expect(service.sendNow({ taskId: "t", agentId: "a", id: item.id }, x.paseo)).rejects.toThrow("offline");
  expect((await store.read()).sessions.a.queue[0].id).toBe(item.id);
  expect(await store.readFiles(stored.files)).toHaveLength(1);
  fail = false;
  await service.sendNow({ taskId: "t", agentId: "a", id: item.id }, x.paseo);
  expect((seen.at(-1) as unknown[])).toEqual([expect.objectContaining({ type: "uploaded_file", fileName: "binary.bin" }), reference]);
  await expect(store.readFiles(stored.files)).rejects.toThrow();
  expect((await store.read()).sessions.a).toBeUndefined();
});
