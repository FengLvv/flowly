import { expect, test, vi } from "vitest";
import type { PaseoAgent, PaseoApi } from "@getpaseo/client";
import type { Board } from "../shared/model";
import { readAttentionCount, readSidebarCounts } from "./attention-count";
import { attentionFromSources } from "../shared/attention";
import { readAttentionCount as contract, readSidebarCounts as sidebarContract } from "../shared/rpc";
import { SUMMARIZER_LABELS } from "../shared/summary";

const at = "2026-10-23T04:00:00.000Z";
const project = { id: "p", archivedAt: null };
const task = (id: string) => ({ id, projectId: "p", workspaceId: id, archivedAt: null });
const agent = (id: string, extra = {}) => ({ id, workspaceId: id, status: "idle", archivedAt: null, ...extra }) as PaseoAgent;
const finished = { requiresAttention: true, attentionReason: "finished", attentionTimestamp: at };
const board = () => ({ projects: [{ ...project }], tasks: [task("a"), task("b"), task("c")], events: [] }) as unknown as Board;

function fixture(value = board(), agents = [agent("a", finished)], failReads = false) {
  const store = { read: vi.fn(async () => value) };
  const reads = { read: vi.fn(async () => {
    if (failReads) throw Error("invalid receipts");
    return { version: 1 as const, receipts: [] };
  }) };
  const list = vi.fn(async (_input: unknown) => ({ entries: agents.map((agent) => ({ agent })), pageInfo: {} }));
  return { store, reads, list, paseo: { agents: { list } } as unknown as PaseoApi };
}

test("count-only contract matches the board rule and never returns board/agent data", async () => {
  const agents = [agent("a", finished), agent("b", { pendingPermissions: [{}] }), agent("c", { status: "running" })];
  const f = fixture(board(), agents);
  const result = await readAttentionCount(f.store, f.reads, f.paseo);
  expect(result).toEqual({ count: 2 });
  expect(result.count).toBe(attentionFromSources({ board: board(), agents, receipts: [], readUnavailable: false })!.length);
  expect(contract.output.parse(result)).toEqual(result);
  expect(() => contract.input.parse({ taskId: "a" })).toThrow();
  expect(() => contract.output.parse({ count: -1 })).toThrow();
  expect(() => contract.output.parse({ count: 1, tasks: [] })).toThrow();
});

test("all SDK pages are counted and summarizers/archived scopes are excluded", async () => {
  const f = fixture();
  const b = board();
  b.tasks[2].archivedAt = at;
  f.store.read.mockResolvedValue(b);
  f.list.mockResolvedValueOnce({ entries: [{ agent: agent("a", finished) }], pageInfo: { nextCursor: "next" } } as never)
    .mockResolvedValueOnce({ entries: [{ agent: agent("b", { status: "error" }) }, { agent: agent("c", finished) },
      { agent: agent("a", { status: "error", labels: SUMMARIZER_LABELS }) }], pageInfo: {} });
  expect(await readAttentionCount(f.store, f.reads, f.paseo)).toEqual({ count: 2 });
  expect(f.list).toHaveBeenNthCalledWith(2, { filter: { includeArchived: false }, page: { limit: 200, cursor: "next" } });
  b.projects[0].archivedAt = at;
  expect(await readAttentionCount(f.store, f.reads, f.paseo)).toEqual({ count: 0 });
});

test("receipt failures suppress only unread; errors, questions and permissions remain", async () => {
  const f = fixture(board(), [agent("a", finished), agent("b", { pendingPermissions: [{ id: "ask", kind: "question" }] }),
    agent("c", { status: "error" })], true);
  expect(await readAttentionCount(f.store, f.reads, f.paseo)).toEqual({ count: 2 });
  f.list.mockRejectedValueOnce(Error("SDK unavailable"));
  await expect(readAttentionCount(f.store, f.reads, f.paseo)).rejects.toThrow("SDK unavailable");
  f.store.read.mockRejectedValueOnce(Error("board unavailable"));
  await expect(readAttentionCount(f.store, f.reads, f.paseo)).rejects.toThrow("board unavailable");
});

test("read receipt and dismissal boundaries retain parity; every request reads fresh", async () => {
  const f = fixture();
  const token = JSON.stringify(["a", "finished", at]);
  f.reads.read.mockResolvedValueOnce({ version: 1, receipts: [{ taskId: "a", agentId: "a", workspaceId: "a", token, readAt: at }] } as never);
  expect(await readAttentionCount(f.store, f.reads, f.paseo)).toEqual({ count: 0 });
  const b = board();
  const item = attentionFromSources({ board: b, agents: [agent("a", finished)], receipts: [], readUnavailable: false })![0];
  b.attentionDismissals = [{ taskId: "a", signals: item.signals, dismissedAt: at }];
  f.store.read.mockResolvedValue(b);
  expect(await readAttentionCount(f.store, f.reads, f.paseo)).toEqual({ count: 0 });
  f.list.mockResolvedValue({ entries: [{ agent: agent("a", { ...finished, attentionTimestamp: "2026-10-23T04:01:00.000Z" }) }], pageInfo: {} });
  expect(await readAttentionCount(f.store, f.reads, f.paseo)).toEqual({ count: 1 });
  expect(f.store.read).toHaveBeenCalledTimes(3);
});

test("sidebar counts actual host-wide conversations independently of Flowly business scope", async () => {
  const b = board();
  b.projects[0].archivedAt = at;
  const f = fixture(b, [agent("unbound", { status: "running" }),
    agent("child", { status: "running", labels: { "paseo.parent-agent-id": "unbound" } }),
    agent("a", { status: "running" }), agent("b", finished)]);
  expect(await readSidebarCounts(f.store, f.reads, f.paseo)).toEqual({ attention: 0, running: 3 });
  expect(f.list).toHaveBeenCalledTimes(1);
});

test("sidebar excludes waiting, failure, archived, helpers and history-only restoration", async () => {
  const f = fixture(board(), [agent("waiting", { status: "running", pendingPermissions: [{}] }),
    agent("question", { status: "running", requiresAttention: true, attentionReason: "permission" }),
    agent("error", { status: "error" }), agent("idle"), agent("closed", { status: "closed" }),
    agent("archived", { status: "running", archivedAt: at }),
    agent("helper", { status: "running", labels: SUMMARIZER_LABELS }),
    agent("legacy-helper", { status: "running", labels: { "ultra-kanban": "summarizer" } }),
    agent("history", { status: "initializing", lastUserMessageAt: at, activeTurn: null }),
    agent("new", { status: "initializing" }),
    agent("turn", { status: "initializing", lastUserMessageAt: at, activeTurn: { startedAt: at } })]);
  expect((await readSidebarCounts(f.store, f.reads, f.paseo)).running).toBe(2);
});

test("sidebar paginates and deduplicates by newest native snapshot without stale running counts", async () => {
  const f = fixture();
  f.list.mockResolvedValueOnce({ entries: [
    { agent: agent("ended", { status: "running", updatedAt: "2026-10-23T03:00:00Z" }) },
    { agent: agent("live", { status: "running", updatedAt: at }) },
  ], pageInfo: { nextCursor: "next" } } as never).mockResolvedValueOnce({ entries: [
    { agent: agent("ended", { status: "idle", updatedAt: at }) },
    { agent: agent("live", { status: "idle", updatedAt: "2026-10-23T03:00:00Z" }) },
    { agent: agent("other", { status: "running", updatedAt: at }) },
  ], pageInfo: {} });
  expect(await readSidebarCounts(f.store, f.reads, f.paseo)).toEqual({ attention: 0, running: 2 });
  expect(f.list).toHaveBeenNthCalledWith(2, { filter: { includeArchived: false }, page: { limit: 200, cursor: "next" } });
});

test("sidebar keeps Attention independent and never turns failed reads into zero", async () => {
  const f = fixture(board(), [agent("a", finished), agent("b", { status: "running" }),
    agent("c", { status: "error" })], true);
  expect(await readSidebarCounts(f.store, f.reads, f.paseo)).toEqual({ attention: 1, running: 1 });
  f.list.mockRejectedValueOnce(Error("SDK unavailable"));
  await expect(readSidebarCounts(f.store, f.reads, f.paseo)).rejects.toThrow("SDK unavailable");
  f.store.read.mockRejectedValueOnce(Error("board unavailable"));
  await expect(readSidebarCounts(f.store, f.reads, f.paseo)).rejects.toThrow("board unavailable");
});

test("sidebar projection contains only exact nullable counts and preserves the older contract", () => {
  expect(sidebarContract.input.parse({})).toEqual({});
  expect(sidebarContract.output.parse({ attention: null, running: 0 })).toEqual({ attention: null, running: 0 });
  for (const running of [-1, 1.5, "2", undefined])
    expect(() => sidebarContract.output.parse({ attention: 1, running })).toThrow();
  expect(() => sidebarContract.output.parse({ attention: 1, running: 2, agents: [] })).toThrow();
  expect(() => sidebarContract.input.parse({ projectId: "p" })).toThrow();
  expect(contract.output.parse({ count: 2 })).toEqual({ count: 2 });
});
