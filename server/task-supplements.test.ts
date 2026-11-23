import { afterEach, expect, test } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import { taskEdit, taskInput } from "../shared/model";
import { appendTaskSupplement } from "../shared/rpc";
import { appendTaskSupplementInput, taskSupplementLimits, type TaskSupplement } from "../shared/task-supplements";
import { BoardService } from "./service";
import { BoardStore } from "./store";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(supplements?: TaskSupplement[], backend: "json" | "sqlite" = "json") {
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
  return { store, task };
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
  const add = (entry: TaskSupplement) => store.appendTaskSupplement({ taskId: task.id, entry });
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
