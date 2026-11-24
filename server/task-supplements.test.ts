import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import { taskEdit, taskInput, type TaskInput } from "../shared/model";
import { appendTaskSupplement } from "../shared/rpc";
import { appendTaskSupplementInput, taskSupplementLimits, type AppendTaskSupplementInput } from "../shared/task-supplements";
import { DescriptionImageFiles, DescriptionImages } from "./description-images";
import { ProjectFolders } from "./project-folder";
import { BoardService } from "./service";
import { BoardStore } from "./store";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(supplements?: TaskInput["supplements"], backend: "json" | "sqlite" = "json") {
  const root = await mkdtemp(join(tmpdir(), "flowly-supplements-"));
  folders.push(root);
  const repo = join(root, "repo");
  await mkdir(repo);
  const store = new BoardStore(join(root, "data"), { backend, storage: { checkVersion: false } });
  const at = new Date().toISOString();
  await store.mutate((board) => {
    board.projects.push({
      id: "p", paseoProjectId: "native", title: "Fixture", description: "", primaryPath: repo, repos: [repo],
      revision: 1, createdAt: at, updatedAt: at, archivedAt: null,
    });
  });
  const input = taskInput.parse({
    projectId: "p", title: "Task", operationId: "op", mode: "directory", description: "Original description", supplements,
  });
  const task = await new BoardService(store).createTask(input, {} as PaseoApi);
  return { root, repo, store, task };
}

const first = { id: "first", text: "First note" };
const second = { id: "second", text: "Another line\nWith a continuation" };

test("creation and editing preserve note order and leave description independent across reload", async () => {
  const { store, task } = await fixture([{ ...first, text: "  First note  " }, second]);
  expect(task.supplements).toEqual([first, second]);
  const edited = await store.editTask(taskEdit.parse({ id: task.id, revision: task.revision, supplements: [second] }));
  const renamed = await store.editTask(taskEdit.parse({ id: task.id, revision: edited.revision, title: "Renamed" }));
  const freshStore = new BoardStore(store.directory);
  expect((await freshStore.view()).tasks[0]).toMatchObject({ title: "Renamed", description: task.description, supplements: [second] });
  await freshStore.editTask(taskEdit.parse({ id: task.id, revision: renamed.revision, supplements: [] }));
  expect((await store.view()).tasks[0].supplements).toBeUndefined();
});

test("concurrent appends to a legacy card are serialized and retries are idempotent", async () => {
  const { store, task } = await fixture();
  expect(task.supplements).toBeUndefined();
  const add = (entry: AppendTaskSupplementInput["entry"]) => store.appendTaskSupplement({ taskId: task.id, entry });
  await Promise.all([add(first), add(second), add(first)]);
  const saved = await add(second);
  expect(saved.supplements).toEqual([first, second]);
  expect(saved.revision).toBe(task.revision + 2);
  expect((await store.view()).events.filter((event) => event.action === "edited")).toHaveLength(2);
  await expect(add({ ...second, text: "Different" })).rejects.toThrow("already in use");
  await expect(store.editTask(taskEdit.parse({ id: task.id, revision: task.revision, supplements: [] }))).rejects.toThrow("Revision conflict");
  expect((await store.view()).tasks[0].supplements).toEqual([first, second]);
});

test("an appended note is present after reopening SQLite storage", async () => {
  const { store, task } = await fixture([first], "sqlite");
  try {
    expect((await store.storageStatus()).backend).toBe("sqlite");
    await store.appendTaskSupplement({ taskId: task.id, entry: second });
  } finally {
    await store.close();
  }
  const reopened = new BoardStore(store.directory, { backend: "sqlite", storage: { checkVersion: false } });
  try {
    expect((await reopened.view()).tasks[0].supplements).toEqual([first, second]);
  } finally {
    await reopened.close();
  }
});

test("the live list cap never drops entries and allows a replay at capacity", async () => {
  const entries = Array.from({ length: taskSupplementLimits.perTask }, (_, i) => ({ id: `note-${i}`, text: first.text }));
  const { store, task } = await fixture(entries);
  await expect(store.appendTaskSupplement({ taskId: task.id, entry: first })).rejects.toThrow("maximum number");
  expect(await store.appendTaskSupplement({ taskId: task.id, entry: entries[0] })).toEqual(task);
  expect((await store.view()).tasks[0].supplements).toEqual(entries);
});

test("only active cards in active projects accept supplemental note writes", async () => {
  const { store, task } = await fixture([first]);
  const add = (taskId: string) => store.appendTaskSupplement({ taskId, entry: second });
  await expect(add("missing")).rejects.toThrow("Task not found");
  const archived = await store.editTask(taskEdit.parse({ id: task.id, revision: task.revision, archived: true }));
  await expect(add(task.id)).rejects.toThrow("Archived cards");
  await expect(store.editTask(taskEdit.parse({ id: task.id, revision: archived.revision, supplements: [] }))).rejects.toThrow("Archived cards");
  await store.editTask(taskEdit.parse({ id: task.id, revision: archived.revision, archived: false }));
  await store.mutate((board) => { board.projects[0].archivedAt = task.createdAt; });
  await expect(add(task.id)).rejects.toThrow("Archived cards");
  expect((await store.view()).tasks[0].supplements).toEqual([first]);
});

test("the write schemas reject blank, oversized and ambiguous entries", () => {
  expect(appendTaskSupplement.name).toBe("tasks.supplements.append");
  expect(appendTaskSupplementInput.parse({ taskId: "task", entry: { ...first, text: "  First note " } }).entry).toEqual(first);
  for (const text of [" \t\n ", "a".repeat(taskSupplementLimits.text + 1)])
    expect(appendTaskSupplementInput.safeParse({ taskId: "task", entry: { ...first, text } }).success).toBe(false);
  expect(taskEdit.safeParse({ id: "task", revision: 1, supplements: [first, first] }).success).toBe(false);
});

const png = { name: "reference.png", mimeType: "image/png" as const, data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=" };

test("mixed and image-only notes persist and edit in place with revision and image membership checks", async () => {
  const { store, task } = await fixture([{ ...first, images: [png] }, { ...second, text: "", images: [png] }]);
  const savedImage = task.supplements![0].images![0];
  const otherImage = task.supplements![1].images![0];
  const readInput = { taskId: task.id, revision: task.revision, supplementId: first.id, imageId: savedImage.id };
  const reader = new DescriptionImages(new BoardStore(store.directory));
  expect(JSON.stringify(task)).not.toContain(png.data);
  await expect(reader.readSupplementImage(readInput)).resolves.toMatchObject(png);
  await expect(reader.readSupplementImage({ ...readInput, supplementId: second.id })).rejects.toThrow(/belong/);
  await expect(reader.read({ taskId: task.id, revision: task.revision, imageId: savedImage.id })).rejects.toThrow(/belong/);
  const edit = (supplements: unknown[]) => store.editTask(taskEdit.parse({ id: task.id, revision: task.revision, supplements }));
  await expect(edit([{ ...first, images: [{ id: otherImage.id }] }])).rejects.toThrow(/belong/);
  const changed = await edit([
    { ...first, text: "Updated note", images: [{ id: savedImage.id }, { ...png, name: "new.png" }] },
    { ...second, text: "", images: [{ id: otherImage.id }] },
  ]);
  expect(changed.supplements).toMatchObject([{ id: first.id, text: "Updated note", images: [savedImage, { name: "new.png" }] }, task.supplements![1]]);
  await expect(edit([first])).rejects.toThrow(/Revision conflict/);
  await expect(reader.readSupplementImage(readInput)).rejects.toThrow(/Card changed/);
  const removed = await store.editTask(taskEdit.parse({ id: task.id, revision: changed.revision, supplements: [first] }));
  await expect(reader.readSupplementImage({ ...readInput, revision: removed.revision })).rejects.toThrow(/belong/);
  expect(await new DescriptionImageFiles(store.directory).read(savedImage)).toMatchObject({ data: png.data });
});

test("image append retries are idempotent, validate bytes, and roll back unused files after a failed write", async () => {
  const { store, task } = await fixture([first]);
  const files = new DescriptionImageFiles(store.directory);
  const add = (images = [png]) => store.appendTaskSupplement({ taskId: task.id, entry: { ...second, images } });
  await expect(add([{ ...png, data: Buffer.from("not a PNG").toString("base64") }])).rejects.toThrow(/does not match/);
  const event = vi.spyOn(store, "event").mockImplementationOnce(() => { throw new Error("write refused"); });
  try {
    await expect(add()).rejects.toThrow(/write refused/);
  } finally {
    event.mockRestore();
  }
  expect(await readdir(files.directory)).toEqual([]);
  expect((await store.read()).tasks[0]).toEqual(task);
  const saved = await add();
  await expect(add()).resolves.toEqual(saved);
  await expect(add([{ ...png, name: "different.png" }])).rejects.toThrow(/already in use/);
  expect(await readdir(files.directory)).toHaveLength(1);
});

test("folder snapshot copies note images and project restore keeps them readable from a new data directory", async () => {
  const { root, repo, store, task } = await fixture([{ ...first, images: [png] }]);
  const folders = new ProjectFolders(() => store.read(), async () => [], 0, new DescriptionImageFiles(store.directory));
  await folders.flush();
  expect(folders.state("p")?.error).toBe("");
  const target = new BoardStore(join(root, "restored-data"));
  const paseo = { projects: { list: async () => ({ projects: [{ projectId: "native", projectRootPath: repo }] }) } } as unknown as PaseoApi;
  await new BoardService(target).restoreProject({ path: repo }, paseo);
  const [restored] = (await target.read()).tasks;
  expect(restored.supplements).toEqual(task.supplements);
  const imageId = restored.supplements![0].images![0].id;
  const reader = new DescriptionImages(target);
  await expect(reader.readSupplementImage({ taskId: restored.id, revision: restored.revision, supplementId: first.id, imageId })).resolves.toMatchObject(png);
});
