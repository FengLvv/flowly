import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import { BoardStore } from "./store";
import { BoardService } from "./service";
import { DescriptionImageFiles, DescriptionImages } from "./description-images";
import { taskEdit, taskInput } from "../shared/model";
import { maxImageBytes } from "../shared/composer";
import { ProjectFolders, readSnapshot } from "./project-folder";

const png = { name: "reference.png", mimeType: "image/png" as const, data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=" };
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "flowly-description-")); roots.push(root);
  const repo = join(root, "repo"); await mkdir(repo);
  const store = new BoardStore(join(root, "data"));
  const now = new Date().toISOString();
  await store.mutate((b) => b.projects.push({ id: "p", title: "Fixture", description: "", primaryPath: repo, repos: [repo], paseoProjectId: "native", revision: 1, createdAt: now, updatedAt: now, archivedAt: null }));
  const create = vi.fn(async () => ({ id: `w-${create.mock.calls.length}` }));
  const paseo = { workspaces: { create } } as unknown as PaseoApi;
  const service = new BoardService(store);
  const input = taskInput.parse({ projectId: "p", operationId: "op", title: "Image task", description: "Read the picture", mode: "directory", descriptionImages: [png] });
  const reader = new DescriptionImages(store), files = new DescriptionImageFiles(store.directory);
  return { root, repo, store, service, paseo, create, input, reader, files };
}

test("card creation commits metadata only, replays once and survives a fresh store", async () => {
  const x = await setup();
  const task = await x.service.createTask(x.input, x.paseo);
  expect(task.descriptionImages).toHaveLength(1);
  expect(JSON.stringify(await x.store.read())).not.toContain(png.data);
  const fresh = new DescriptionImages(new BoardStore(x.store.directory));
  expect((await fresh.read({ taskId: task.id, revision: task.revision })).images[0]).toMatchObject(png);
  expect((await x.service.createTask(x.input, x.paseo)).id).toBe(task.id);
  expect(x.create).toHaveBeenCalledTimes(1);
  expect(await readdir(x.files.directory)).toHaveLength(1);
});

test("invalid type, noncanonical base64, size and counts fail before workspace provisioning", async () => {
  const x = await setup();
  for (const images of [
    [{ ...png, data: Buffer.from("not a png").toString("base64") }],
    [{ ...png, data: png.data.slice(0, -1) }],
    [{ ...png, data: Buffer.alloc(maxImageBytes + 1).toString("base64") }],
    Array.from({ length: 5 }, () => png),
  ]) await expect(x.service.createTask({ ...x.input, descriptionImages: images }, x.paseo)).rejects.toThrow();
  expect(x.create).not.toHaveBeenCalled();
  expect((await x.store.read()).tasks).toEqual([]);
});

test("edit preserves omitted images, rejects foreign IDs/duplicates/stale edits, clears explicitly", async () => {
  const x = await setup();
  let task = await x.service.createTask(x.input, x.paseo);
  const image = task.descriptionImages![0];
  const other = await x.service.createTask({ ...x.input, operationId: "other" }, x.paseo);
  await expect(x.store.editTask(taskEdit.parse({ id: other.id, revision: 1, descriptionImages: [{ id: image.id }] }))).rejects.toThrow(/belong/);
  await expect(x.store.editTask(taskEdit.parse({ id: task.id, revision: 1, descriptionImages: [{ id: image.id }, { id: image.id }] }))).rejects.toThrow(/repeated/);
  task = await x.store.editTask(taskEdit.parse({ id: task.id, revision: 1, description: "Edited" }));
  expect(task.descriptionImages).toEqual([image]);
  await expect(x.store.editTask(taskEdit.parse({ id: task.id, revision: 1, descriptionImages: [] }))).rejects.toThrow(/Revision/);
  await expect(x.reader.read({ taskId: task.id, revision: 1 })).rejects.toThrow(/changed/);
  task = await x.store.editTask(taskEdit.parse({ id: task.id, revision: task.revision, descriptionImages: [] }));
  await expect(x.reader.read({ taskId: task.id, revision: task.revision, imageId: image.id })).rejects.toThrow(/belong/);
  expect(task.descriptionImages).toBeUndefined();
  expect(await x.files.read(image)).toMatchObject({ data: png.data }); // historical backups still work
});

test("card-scoped reads reject unrelated images, missing files and corruption", async () => {
  const x = await setup();
  const task = await x.service.createTask(x.input, x.paseo);
  const image = task.descriptionImages![0];
  await expect(x.reader.read({ taskId: "missing", revision: 1 })).rejects.toThrow(/not found/);
  await expect(x.reader.read({ taskId: task.id, revision: 1, imageId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/belong/);
  const path = join(x.files.directory, (await readdir(x.files.directory))[0]);
  const bytes = Buffer.from(png.data, "base64"); bytes[12] ^= 1;
  await writeFile(path, bytes);
  await expect(x.reader.read({ taskId: task.id, revision: 1 })).rejects.toThrow(/corrupt/);
  await expect(x.store.editTask(taskEdit.parse({ id: task.id, revision: 1, descriptionImages: [{ id: image.id }] }))).rejects.toThrow(/corrupt/);
  expect((await x.store.read()).tasks[0].revision).toBe(1);
  await rm(path);
  await expect(x.reader.read({ taskId: task.id, revision: 1 })).rejects.toThrow(/missing/);
});

test("a failed commit removes only new unused files and keeps original card state", async () => {
  const x = await setup();
  const task = await x.service.createTask(x.input, x.paseo);
  const original = task.descriptionImages![0];
  vi.spyOn(x.store, "event").mockImplementationOnce(() => { throw new Error("write refused"); });
  await expect(x.store.editTask(taskEdit.parse({ id: task.id, revision: 1, description: "must roll back", descriptionImages: [png] }))).rejects.toThrow("write refused");
  expect((await x.store.read()).tasks[0]).toEqual(task);
  expect(await readdir(x.files.directory)).toHaveLength(1);
  expect(await x.files.read(original)).toMatchObject({ data: png.data });
});

test("failed card creation cleans image bytes and retries without duplicate workspaces", async () => {
  const x = await setup();
  vi.spyOn(x.store, "event").mockImplementationOnce(() => { throw new Error("write refused"); });
  await expect(x.service.createTask(x.input, x.paseo)).rejects.toThrow(/Card was not saved/);
  expect(await readdir(x.files.directory)).toEqual([]);
  expect((await x.store.read()).tasks).toHaveLength(0);
  // Workspace retention/recovery is the existing service contract, not implicit deletion.
});

test("folder snapshot carries bytes and restores into a different data directory", async () => {
  const x = await setup();
  const task = await x.service.createTask(x.input, x.paseo);
  const folders = new ProjectFolders(() => x.store.read(), async () => [], 0, x.files);
  await folders.flush();
  expect(folders.state("p")?.error).toBe("");
  const snapshot = (await readSnapshot(x.repo))!;
  const target = new BoardStore(join(x.root, "restored-data"));
  await new DescriptionImageFiles(join(x.repo, ".flowly")).copyTo(new DescriptionImageFiles(target.directory), snapshot.tasks.flatMap((t) => t.descriptionImages || []));
  await target.restoreProject(snapshot, { primaryPath: x.repo, paseoProjectId: "native" });
  expect((await new DescriptionImages(target).read({ taskId: task.id, revision: (await target.read()).tasks[0].revision })).images[0].data).toBe(png.data);
  // Permanent deletion retains backup assets, but removes live access.
  await x.store.deleteTask({ id: task.id, revision: task.revision });
  await expect(x.reader.read({ taskId: task.id, revision: task.revision })).rejects.toThrow(/not found/);
  expect(await x.files.read(task.descriptionImages![0])).toMatchObject({ data: png.data });
});

test("legacy image-free cards save without adding image fields", async () => {
  const x = await setup();
  const task = await x.service.createTask({ ...x.input, descriptionImages: undefined }, x.paseo);
  expect(task.descriptionImages).toBeUndefined();
  const edited = await x.store.editTask(taskEdit.parse({ id: task.id, revision: 1, description: "Legacy" }));
  expect((await x.reader.read({ taskId: edited.id, revision: edited.revision })).images).toEqual([]);
});
