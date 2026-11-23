import { afterEach, expect, test, vi } from "vitest";
import type { PaseoApi } from "@getpaseo/client";
import { mkdtemp, mkdir, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BoardStore } from "./store";
import { BoardService, resolveWorktreeBaseRef } from "./service";
import {
  projectInput,
  taskInput,
  taskEdit,
  projectEdit,
} from "../shared/model";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const git = promisify(execFile),
  roots: string[] = [];
async function setup() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "ultra-single-root-")),
  );
  roots.push(root);
  const a = join(root, "project-root"),
    b = join(root, "old-second-repo");
  await mkdir(a);
  await mkdir(b);
  const store = new BoardStore(join(root, "data")),
    service = new BoardService(store),
    now = new Date().toISOString();
  await store.mutate((board) =>
    board.projects.push({
      id: "p",
      paseoProjectId: "native",
      title: "Legacy project",
      description: "",
      primaryPath: a,
      repos: [a, b],
      revision: 1,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    }),
  );
  const create = vi.fn(async (_options: unknown) => ({ id: "workspace" }));
  const refresh = vi.fn(async () => ({
    id: "workspace",
    projectId: "foreign-native",
    workspaceDirectory: a,
    workspaceKind: "directory",
    status: "done",
  }));
  const paseo = {
    workspaces: { create, ref: () => ({ refresh }) },
  } as unknown as PaseoApi;
  const input = {
    projectId: "p",
    operationId: "op",
    title: "New card",
    description: "",
    status: "todo" as const,
    priority: "normal" as const,
    mode: "directory" as const,
    baseRef: "",
  };
  return { root, a, b, store, service, paseo, create, refresh, input };
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});

test("new card uses only native root even in a previously multi-repo project", async () => {
  const x = await setup(),
    card = await x.service.createTask(x.input, x.paseo);
  expect(card).toMatchObject({ sourcePath: x.a, repoPaths: [x.a], workspaceId: "", workspacePlan: { mode: "directory" } });
  expect(x.create).not.toHaveBeenCalled();
  await x.service.ensureWorkspace(card.id, x.paseo);
  expect(x.create.mock.calls[0][0]).toMatchObject({
    source: { kind: "directory", path: x.a, projectId: "native" },
  });
  expect((await x.service.context(card.id, x.paseo)).directories).toEqual([
    { repo: x.a, directory: x.a },
  ]);
  expect((await x.service.createTask(x.input, x.paseo)).id).toBe(card.id);
  expect(x.create).toHaveBeenCalledTimes(1);
});
test("a common parent directory contains two repositories without registering each separately", async () => {
  const x = await setup();
  await mkdir(join(x.a, "repo-one"));
  await mkdir(join(x.a, "repo-two"));
  const card = await x.service.createTask(x.input, x.paseo);
  expect(card.sourcePath).toBe(x.a);
  expect((await x.service.context(card.id, x.paseo)).context).toContain(
    "Native Paseo project root: " + x.a,
  );
  expect(x.create).not.toHaveBeenCalled();
  await x.service.ensureWorkspace(card.id, x.paseo);
  expect(x.create.mock.calls[0][0]).toMatchObject({ source: { path: x.a } });
});

test("availability-only context preserves fresh scope metadata without building session instructions", async () => {
  const x = await setup();
  const card = await x.service.createTask(x.input, x.paseo);
  await x.service.ensureWorkspace(card.id, x.paseo);
  const externalInputs = vi.spyOn(x.service as any, "unreadableExternals");
  const full = await x.service.context(card.id, x.paseo);
  expect(full.context).toContain("Native Paseo project root: " + x.a);
  expect(externalInputs).toHaveBeenCalledTimes(1);
  externalInputs.mockClear();
  x.refresh.mockClear();
  const lean = await x.service.context(card.id, x.paseo, undefined, false);
  expect(x.refresh).toHaveBeenCalledTimes(1);
  expect(externalInputs).not.toHaveBeenCalled();
  expect(lean).toEqual({ ...full, context: "", memoryIds: [] });
  x.refresh.mockResolvedValueOnce(null as never);
  expect(await x.service.context(card.id, x.paseo, undefined, false)).toMatchObject({ available: false, context: "" });
});
test("new board project links the exact native Paseo root and persists only that directory", async () => {
  const x = await setup(),
    nativeRoot = join(x.root, "common-root");
  await mkdir(nativeRoot);
  await mkdir(join(nativeRoot, "repo-one"));
  await mkdir(join(nativeRoot, "repo-two"));
  const native = {
    projectId: "new-native",
    projectRootPath: nativeRoot,
    projectDisplayName: "Common root",
  };
  const paseo = {
    projects: { list: async () => ({ projects: [native] }) },
  } as unknown as PaseoApi;
  const created = await x.service.createProject(
    {
      title: "Combined",
      description: "",
      primaryPath: nativeRoot,
      paseoProjectId: "new-native",
    },
    paseo,
  );
  expect(created).toMatchObject({
    paseoProjectId: "new-native",
    primaryPath: nativeRoot,
    repos: [nativeRoot],
    // Auto review is on for new projects (GUARDRAILS-SPEC D1).
    autoReview: { enabled: true, maxRounds: 2 },
  });
  await expect(
    x.service.createProject(
      {
        title: "Again",
        description: "",
        primaryPath: nativeRoot,
        paseoProjectId: "new-native",
      },
      paseo,
    ),
  ).rejects.toThrow("already linked");
  await expect(
    x.service.createProject(
      {
        title: "Wrong root",
        description: "",
        primaryPath: x.a,
        paseoProjectId: "new-native",
      },
      paseo,
    ),
  ).rejects.toThrow("root does not match");
});
test("existing workspace inside a child repo is eligible through common project root", async () => {
  const x = await setup(),
    child = join(x.a, "repo-one");
  await mkdir(child);
  x.refresh.mockResolvedValue({
    ...(await x.refresh()),
    workspaceDirectory: child,
  });
  const card = await x.service.createTask(
    { ...x.input, mode: "existing", workspaceId: "workspace" },
    x.paseo,
  );
  expect(card).toMatchObject({ sourcePath: x.a, repoPaths: [x.a] });
  expect(
    (await x.service.context(card.id, x.paseo)).workspaceRepoPaths,
  ).toEqual([x.a]);
});
test("worktree originates from native root and default base resolves its named branch", async () => {
  const x = await setup();
  await git("git", ["-C", x.a, "init", "-b", "root-main"]);
  await git("git", ["-C", x.b, "init", "-b", "secondary-release"]);
  const card = await x.service.createTask(
    { ...x.input, mode: "worktree", branchName: "single-root", baseRef: "" },
    x.paseo,
  );
  expect(card.sourcePath).toBe(x.a);
  // Kept on the card for the review's own change (GUARDRAILS-SPEC §6.2).
  expect(card.baseRef).toBe("refs/heads/root-main");
  expect(x.create).not.toHaveBeenCalled();
  await x.service.ensureWorkspace(card.id, x.paseo);
  expect(x.create.mock.calls[0][0]).toMatchObject({
    source: {
      kind: "worktree",
      cwd: x.a,
      projectId: "native",
      refName: "refs/heads/root-main",
    },
  });
  expect(await resolveWorktreeBaseRef(x.a, "HEAD")).toBe(
    "refs/heads/root-main",
  );
});
test("non-Git common root requires a directory workspace", async () => {
  const x = await setup();
  await expect(
    x.service.createTask(
      { ...x.input, mode: "worktree", branchName: "feature" },
      x.paseo,
    ),
  ).rejects.toThrow("Enter a valid base ref");
  expect(x.create).not.toHaveBeenCalled();
  const card = await x.service.createTask(x.input, x.paseo);
  expect(x.create).not.toHaveBeenCalled();
  await x.service.ensureWorkspace(card.id, x.paseo);
  expect(x.create).toHaveBeenCalledTimes(1);
});
test("a failed first workspace attempt retries with the persisted native key", async () => {
  const x = await setup();
  const card = await x.service.createTask({ ...x.input, mode: "worktree", branchName: "feature", baseRef: "main" }, x.paseo);
  expect(x.create).not.toHaveBeenCalled();
  x.create.mockRejectedValueOnce(new Error("temporarily unavailable"));
  await expect(x.service.ensureWorkspace(card.id, x.paseo)).rejects.toThrow("temporarily unavailable");
  expect((await x.store.read()).tasks[0].workspaceId).toBe("");
  await x.store.editTask({ id: card.id, revision: card.revision, title: "Edited", actor: "human" });
  const recovered = await new BoardService(x.store).ensureWorkspace(card.id, x.paseo);
  expect(x.create.mock.calls[0][0]).toEqual(x.create.mock.calls[1][0]);
  expect(recovered.workspaceId).toBe("workspace");
  expect(recovered.title).toBe("Edited");
  expect(recovered.workspacePlan).toBeUndefined();
});

test("existing root workspace retains foreign native owner and cannot bind twice", async () => {
  const x = await setup(),
    input = { ...x.input, mode: "existing" as const, workspaceId: "workspace" };
  const card = await x.service.createTask(input, x.paseo);
  expect(card).toMatchObject({
    sourcePath: x.a,
    repoPaths: [x.a],
    workspaceId: "workspace",
  });
  await expect(
    x.service.createTask({ ...input, operationId: "other" }, x.paseo),
  ).rejects.toThrow("already bound");
  expect(x.create).not.toHaveBeenCalled();
  expect((await x.refresh()).projectId).toBe("foreign-native");
});
test("new card cannot link workspace in secondary legacy repo or outside root", async () => {
  const x = await setup(),
    input = { ...x.input, mode: "existing" as const, workspaceId: "workspace" };
  x.refresh.mockResolvedValue({
    ...(await x.refresh()),
    workspaceDirectory: x.b,
  });
  await expect(x.service.createTask(input, x.paseo)).rejects.toThrow("outside");
  x.refresh.mockResolvedValue({
    ...(await x.refresh()),
    workspaceDirectory: x.store.directory,
  });
  await expect(x.service.createTask(input, x.paseo)).rejects.toThrow("outside");
  x.refresh.mockResolvedValue(null as never);
  await expect(x.service.createTask(input, x.paseo)).rejects.toThrow(
    "unavailable",
  );
  expect((await x.store.read()).tasks).toHaveLength(0);
});
test("legacy card retains saved two-directory context and workspace", async () => {
  const x = await setup(),
    now = new Date().toISOString();
  x.refresh.mockResolvedValue({
    ...(await x.refresh()),
    workspaceDirectory: x.b,
    workspaceKind: "directory",
  });
  await x.store.mutate((board) =>
    board.tasks.push({
      id: "old",
      projectId: "p",
      workspaceId: "workspace",
      sourcePath: x.b,
      repoPaths: [],
      title: "Old",
      description: "",
      status: "todo",
      priority: "normal",
      position: 0,
      revision: 1,
      operationId: "old-op",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    }),
  );
  const context = await x.service.context("old", x.paseo);
  expect(context.available).toBe(true);
  expect(context.directories).toEqual([
    { repo: x.a, directory: x.a },
    { repo: x.b, directory: x.b },
  ]);
  expect(context.context).toContain("Legacy card scope retained");
  await x.store.editTask({
    id: "old",
    revision: 1,
    title: "Edited",
    actor: "human",
  });
  expect((await x.store.read()).tasks[0]).toMatchObject({
    sourcePath: x.b,
    repoPaths: [],
    workspaceId: "workspace",
  });
});
test("new write contracts reject old repo/source fields", () => {
  expect(() =>
    projectInput.parse({
      title: "P",
      primaryPath: "/root",
      repos: ["/root", "/other"],
    }),
  ).toThrow();
  expect(() =>
    projectEdit.parse({ id: "p", revision: 1, repos: ["/root", "/other"] }),
  ).toThrow();
  expect(() =>
    taskInput.parse({
      projectId: "p",
      operationId: "o",
      title: "T",
      mode: "directory",
      repoPaths: ["/other"],
      sourcePath: "/other",
    }),
  ).toThrow();
  expect(() =>
    taskEdit.parse({ id: "t", revision: 1, repoPaths: ["/other"] }),
  ).toThrow();
});

test("worktree branch is optional: generated name is stable per operation", async () => {
  const { generatedBranchName } = await import("./service");
  expect(generatedBranchName("Fix Login Bug!", "op-1")).toMatch(/^kanban\/fix-login-bug-[0-9a-f]{6}$/);
  expect(generatedBranchName("F1 卡片显示摘要", "op-1")).toMatch(/^kanban\/f1-[0-9a-f]{6}$/);
  expect(generatedBranchName("卡片显示摘要", "op-1")).toMatch(/^kanban\/task-[0-9a-f]{6}$/);
  expect(generatedBranchName("x", "op-1")).toBe(generatedBranchName("x", "op-1"));
  expect(generatedBranchName("x", "op-1")).not.toBe(generatedBranchName("x", "op-2"));
  expect(generatedBranchName("a".repeat(80), "op").length).toBeLessThanOrEqual(7 + 40 + 7);
});

test("worktree card without a branch name uses the generated branch", async () => {
  const x = await setup();
  await git("git", ["-C", x.a, "init", "-b", "main"]);
  const card = await x.service.createTask({ ...x.input, mode: "worktree", branchName: "  " }, x.paseo);
  expect(x.create).not.toHaveBeenCalled();
  await x.service.ensureWorkspace(card.id, x.paseo);
  expect(x.create.mock.calls[0][0]).toMatchObject({
    source: { kind: "worktree", branchName: expect.stringMatching(/^kanban\/new-card-[0-9a-f]{6}$/) },
  });
});
test("a new card is appended after fractional or reordered positions in its column", async () => {
  const x = await setup();
  let n = 0;
  x.create.mockImplementation(async () => ({ id: `workspace-${++n}` }));
  const first = await x.service.createTask({ ...x.input, operationId: "o1" }, x.paseo);
  const second = await x.service.createTask({ ...x.input, operationId: "o2" }, x.paseo);
  await x.store.placeTask({ id: first.id, revision: first.revision, status: "todo", beforeId: null, afterId: second.id });
  const third = await x.service.createTask({ ...x.input, operationId: "o3" }, x.paseo);
  const column = (await x.store.read()).tasks.sort((a, b) => a.position - b.position).map((t) => t.id);
  expect(column).toEqual([second.id, first.id, third.id]);
  expect(third.position).toBeGreaterThan(first.position);
});


test("pending card reads, edits and wrap-up never query or create a native workspace", async () => {
  const x = await setup();
  const card = await x.service.createTask(x.input, x.paseo);
  const ctx = await x.service.context(card.id, x.paseo);
  expect(ctx.available).toBe(true);
  expect(ctx.reason).toBe("");
  const { cardDetail } = await import("../shared/card-detail");
  expect(cardDetail(await x.store.read(), { taskId: card.id, workspaceId: "" }).task.workspacePlan).toBeDefined();
  const { WrapupService } = await import("./wrapup");
  const { ArchivedSessionsService } = await import("./archived-sessions");
  expect(await new ArchivedSessionsService(x.store).list(card.id, x.paseo)).toEqual([]);
  await x.store.editTask({ id: card.id, revision: card.revision, title: "Planned", status: "done", actor: "human" });
  const check = await new WrapupService(x.store).check(card.id, x.paseo);
  expect(check).toMatchObject({ workspace: null, sessions: 0, blockers: [], warnings: [] });
  expect(x.refresh).not.toHaveBeenCalled();
  expect(x.create).not.toHaveBeenCalled();
});

test("concurrent first sessions across service instances bind exactly one workspace", async () => {
  const x = await setup();
  const card = await x.service.createTask(x.input, x.paseo);
  const [a,b] = await Promise.all([x.service.ensureWorkspace(card.id, x.paseo), new BoardService(x.store).ensureWorkspace(card.id, x.paseo)]);
  expect(a.workspaceId).toBe("workspace");
  expect(b.workspaceId).toBe(a.workspaceId);
  expect(x.create).toHaveBeenCalledTimes(1);
  expect(a.revision).toBe(card.revision + 1);
  await x.service.ensureWorkspace(card.id, x.paseo);
  expect(x.create).toHaveBeenCalledTimes(1);
});

test("failed binding save recovers with the same native key after reload and title edit", async () => {
  const x = await setup();
  const card = await x.service.createTask(x.input, x.paseo);
  const mutation = vi.spyOn(x.store, "mutate").mockRejectedValueOnce(new Error("disk full"));
  await expect(x.service.ensureWorkspace(card.id, x.paseo)).rejects.toThrow("disk full");
  mutation.mockRestore();
  await x.store.editTask({ id: card.id, revision: card.revision, title: "Renamed", actor: "human" });
  const store = new BoardStore(x.store.directory);
  const result = await new BoardService(store).ensureWorkspace(card.id, x.paseo);
  expect(result.workspaceId).toBe("workspace");
  expect(x.create.mock.calls[0][0]).toEqual(x.create.mock.calls[1][0]);
});

test("archived pending cards and projects refuse provisioning", async () => {
  const x = await setup();
  const card = await x.service.createTask(x.input, x.paseo);
  await x.store.editTask({ id: card.id, revision: card.revision, archived: true, actor: "human" });
  await expect(x.service.ensureWorkspace(card.id, x.paseo)).rejects.toThrow("archived");
  expect(x.create).not.toHaveBeenCalled();
});

test("archive during provisioning refuses binding and unarchive retries the same workspace", async () => {
  const x = await setup();
  const card = await x.service.createTask(x.input, x.paseo);
  x.create.mockImplementationOnce(async () => {
    await x.store.editTask({ id: card.id, revision: card.revision, archived: true, actor: "human" });
    return { id: "workspace" };
  });
  await expect(x.service.ensureWorkspace(card.id, x.paseo)).rejects.toThrow("Card changed");
  const pending = (await x.store.read()).tasks[0];
  expect(pending.workspaceId).toBe("");
  await x.store.editTask({ id: card.id, revision: pending.revision, archived: false, actor: "human" });
  await x.service.ensureWorkspace(card.id, x.paseo);
  expect(x.create.mock.calls[0][0]).toEqual(x.create.mock.calls[1][0]);
});
