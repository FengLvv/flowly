import { afterEach, describe, expect, test, vi } from "vitest";
import { mkdir, readFile, realpath, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import { createTapdAdapter, tapdAdapter } from "./tapd";
import { ConnectorService } from "./service";
import { BoardService } from "../service";
import { BoardStore } from "../store";
import type { StoredConnection } from "./http";
import { ExternalError } from "./http";
import { tapdItemType, tapdKey, type TapdKind } from "../../shared/tapd";
import type { TapdCall, TapdTool } from "./tapd-mcp";

const id = "1000000042000000123";
const c: StoredConnection = { id: "c", provider: "tapd-internal", name: "Example", baseUrl: "https://tapd.woa.com/tapd_fe/42", email: "", secret: "", login: "", account: "Example", verifiedAt: "now", authFailed: false };
const ref = (kind: TapdKind = "story", number = id) => ({ key: tapdKey("42", kind, number), itemType: tapdItemType(kind) });
const item = { id, workspace_id: "42", name: "Sample requirement", description: "<p>Steps <strong>here</strong></p>", status: "open", v_status: "In progress", owner: "alice", modified: "2026-11-13 10:00:00" };
function fixture(override?: (tool: TapdTool, args: Record<string, unknown>) => unknown) {
  const call = vi.fn<TapdCall>(async (tool, args) => {
    const replacement = override?.(tool, args);
    if (replacement !== undefined) return replacement;
    if (tool === "user_participant_workspace_get") return [{ id: "42", name: "Example" }];
    if (tool === "tapd_id_get") return [{ ShardIdMap: { type: args.type, short_id: String(args.short_id), workspace_id: "42", long_id: id } }];
    if (tool === "comments_get") return { data: [{ id: "c1", workspace_id: "42", entry_id: id, author: "bob", description: "<p>Comment</p>", created: "today" }] };
    return { data: [item] };
  });
  return { call, adapter: createTapdAdapter(call) };
}
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) { if (!root.startsWith(resolve(".test-data") + "\\") && !root.startsWith(resolve(".test-data") + "/")) throw new Error("Unsafe cleanup"); await rm(root, { recursive: true, force: true }); } });

describe("TAPD read-only adapter", () => {
  test("verify checks explicit project membership and has no token", async () => {
    const x = fixture();
    expect(await x.adapter.verify(c, fetch)).toEqual({ account: "Example", login: "" });
    await expect(x.adapter.verify({ ...c, baseUrl: c.baseUrl.replace('/42','/43') }, fetch)).rejects.toMatchObject({ code: "EXTERNAL_AUTH" });
    expect(x.call.mock.calls.every(([tool]) => tool === "user_participant_workspace_get")).toBe(true);
  });
  test.each(["story", "bug", "task"] as const)("reads an exact %s with body and comments", async (kind) => {
    const x = fixture();
    const found = await x.adapter.get(c, fetch, ref(kind), true);
    expect(found.summary).toMatchObject({ key: ref(kind).key, remoteId: id, status: "In progress", itemType: tapdItemType(kind) });
    const rendered = x.adapter.markdown(found.summary, found.full, 32000);
    expect(rendered.markdown).toContain("Steps **here**");
    expect(rendered.markdown).toContain("Comment");
    expect(rendered.markdown).toContain("reference only");
    expect(x.adapter.description!(found.full)).toBe("Steps **here**");
    expect(x.call.mock.calls[0]![1].id).toBe(id);
    expect(x.call.mock.calls[1]).toEqual(["comments_get", { workspace_id: "42", entry_type: kind, entry_id: id, page: 1, limit: 20 }]);
  });
  test("short IDs resolve through ShardIdMap without concatenation and cannot cross projects", async () => {
    const x = fixture();
    expect((await x.adapter.get(c, fetch, ref("bug", "123"), false)).summary.remoteId).toBe(id);
    expect(x.call.mock.calls[0]).toEqual(["tapd_id_get", { short_id: 123, type: "bug" }]);
    const wrong = fixture((tool) => tool === "tapd_id_get" ? [{ ShardIdMap: { workspace_id: "43", type: "bug", short_id: "123", long_id: id } }] : undefined);
    await expect(wrong.adapter.get(c, fetch, ref("bug", "123"), false)).rejects.toMatchObject({ code: "EXTERNAL_NOT_FOUND" });
    expect(wrong.call).toHaveBeenCalledTimes(1);
  });
  test("invalid project/key/kind are rejected before any MCP request", async () => {
    const x = fixture();
    for (const bad of [{ ...ref(), key: tapdKey("43", "story", id) }, { ...ref(), itemType: "issue" as const }])
      await expect(x.adapter.get(c, fetch, bad, false)).rejects.toMatchObject({ code: "EXTERNAL_INVALID" });
    expect(x.call).not.toHaveBeenCalled();
    await expect(x.adapter.search(c, fetch, 'https://tapd.woa.com/tapd_fe/43/story/detail/' + id, { repos: [], all: false })).rejects.toMatchObject({ code: "EXTERNAL_INVALID" });
    expect(x.call).not.toHaveBeenCalled();
  });
  test("returned numeric, wrong-ID and cross-project data are errors, never successful empty results", async () => {
    for (const bad of [{ ...item, id: Number(id) }, { ...item, id: "1000000042000000124" }, { ...item, workspace_id: "43" }]) {
      const x = fixture((tool) => tool === "stories_get" ? { data: [bad] } : undefined);
      await expect(x.adapter.get(c, fetch, ref(), true)).rejects.toMatchObject({ code: "EXTERNAL_INVALID" });
    }
    const empty = fixture((tool) => tool === "stories_get" ? [] : undefined);
    await expect(empty.adapter.get(c, fetch, ref(), false)).rejects.toMatchObject({ code: "EXTERNAL_NOT_FOUND" });
  });
  test("recent and title search are bounded and bare long numbers search all kinds", async () => {
    const x = fixture();
    expect(await x.adapter.search(c, fetch, "", { repos: [], all: false })).toHaveLength(3);
    expect(x.call.mock.calls.every(([, args]) => args.workspace_id === "42" && args.limit === 10 && args.page === 1)).toBe(true);
    x.call.mockClear();
    await x.adapter.search(c, fetch, 'TQL <title>|*', { repos: [], all: true });
    expect(x.call.mock.calls[0]![1].name).toBe('title');
    expect(x.call.mock.calls[1]![1].title).toBe('title');
    expect(x.call.mock.calls.every(([, args]) => !('query_token' in args))).toBe(true);
    x.call.mockClear();
    expect(await x.adapter.search(c, fetch, id, { repos: [], all: false })).toHaveLength(3);
    expect(x.call.mock.calls.every(([, args]) => args.id === id)).toBe(true);
  });
  test("body/comment edits change fingerprint even with the same parent modified time; status/owner do not", async () => {
    const x = fixture();
    const found = await x.adapter.get(c, fetch, ref(), true);
    const f = found.full as { item: typeof item; comments: Record<string, unknown>[] };
    const hash = x.adapter.fingerprint(f);
    expect(x.adapter.updatedCoversContent).toBe(false);
    expect(x.adapter.fingerprint({ ...f, item: { ...f.item, status: "closed", owner: "other" } })).toBe(hash);
    expect(x.adapter.fingerprint({ ...f, item: { ...f.item, description: "Changed" } })).not.toBe(hash);
    expect(x.adapter.fingerprint({ ...f, comments: [{ ...f.comments[0], description: "Changed" }] })).not.toBe(hash);
    expect(x.adapter.markdown(found.summary, { ...f, item: { ...f.item, description: "字".repeat(50000) } }, 1000).truncated).toBe(true);
  });
  test("comment permission errors and mismatched ownership propagate", async () => {
    const x = fixture((tool) => { if (tool === "comments_get") throw new ExternalError("EXTERNAL_AUTH", "denied"); });
    await expect(x.adapter.get(c, fetch, ref(), true)).rejects.toMatchObject({ code: "EXTERNAL_AUTH" });
    const other = fixture((tool) => tool === "comments_get" ? [{ entry_id: "other" }] : undefined);
    await expect(other.adapter.get(c, fetch, ref(), true)).rejects.toMatchObject({ code: "EXTERNAL_INVALID" });
  });
});

async function connected() {
  const root = resolve(".test-data", `tapd-unit-${randomUUID()}`); roots.push(root);
  await mkdir(root, { recursive: true });
  const x = fixture();
  vi.spyOn(tapdAdapter, "verify").mockImplementation(x.adapter.verify);
  vi.spyOn(tapdAdapter, "get").mockImplementation(x.adapter.get);
  const service = new ConnectorService(join(root, "connectors"));
  const connection = await service.save({ provider: "tapd-internal", baseUrl: c.baseUrl + '/story/detail/' + id, secret: "discard-this-token" });
  return { root, ...x, service, connection };
}
describe("TAPD connection, persistence and card imports", () => {
  test("project URL normalization, no copied token, persistence, and removal", async () => {
    const x = await connected();
    expect(x.connection.baseUrl).toBe(c.baseUrl);
    const disk = await readFile(join(x.root, "connectors", "connections.json"), "utf8");
    expect(disk).not.toContain("discard-this-token");
    expect(x.connection).not.toHaveProperty("secret");
    expect(await new ConnectorService(join(x.root, "connectors")).list()).toEqual([x.connection]);
    await x.service.remove(x.connection.id); await x.service.flush();
    expect(await x.service.list()).toEqual([]);
  });
  test.each(["", "User description"])("new card imports only an empty description (%s), registers input, keeps status", async (description) => {
    const x = await connected();
    const root = await realpath(x.root);
    const store = new BoardStore(join(root, "board"));
    const now = new Date().toISOString();
    await store.mutate((b) => { b.projects.push({ id: "p", paseoProjectId: "native", title: "P", description: "", primaryPath: root, repos: [root], revision: 1, createdAt: now, updatedAt: now, archivedAt: null }); });
    const board = new BoardService(store); board.connectors = x.service;
    const create = vi.fn(async () => ({ id: "workspace" }));
    const paseo = { workspaces: { create, ref: () => ({ refresh: async () => ({ id: "workspace", projectId: "native", workspaceDirectory: root, workspaceKind: "directory", status: "done" }) }) } } as unknown as PaseoApi;
    const task = await board.createTask({ projectId: "p", operationId: "op", title: "User title", description, status: "todo", priority: "normal", mode: "directory", baseRef: "", externals: [{ connectionId: x.connection.id, ...ref() }] }, paseo);
    expect(task.description).toBe(description || "Steps **here**");
    expect(task.status).toBe("todo");
    expect(task.title).toBe("User title");
    expect((await store.read()).artifacts[0]).toMatchObject({ role: "input", external: { provider: "tapd-internal", key: ref().key, remoteId: id } });
    expect(x.call.mock.calls.some(([tool]) => tool === "comments_get")).toBe(!description);
    await x.service.flush();
  });
});
