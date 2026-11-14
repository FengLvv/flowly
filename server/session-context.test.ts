import { expect, test, vi } from "vitest";
import type { PaseoApi } from "@getpaseo/client";
import type { BoardStore } from "./store";
import { SessionContextService } from "./session-context";

function fixture() {
  const board = {
    projects: [{ id: "p", paseoProjectId: "native" }],
    tasks: [{ id: "t", projectId: "p", workspaceId: "target" }, { id: "other-card", projectId: "p", workspaceId: "linked" }],
  };
  const workspaces = [
    { id: "target", projectId: "native", name: "Target" },
    { id: "unbound", projectId: "native", name: "Unbound" },
    { id: "linked", projectId: "other-native", name: "Linked" },
    { id: "foreign", projectId: "other-native", name: "Foreign" },
  ];
  const agents = [
    { id: "a", title: "Source", workspaceId: "unbound" },
    { id: "b", title: "Linked source", workspaceId: "linked" },
    { id: "foreign", workspaceId: "foreign" },
    { id: "archived", workspaceId: "target", archivedAt: "today" },
    { id: "helper", workspaceId: "target", labels: { flowly: "summarizer" } },
    { id: "internal", workspaceId: "target", internal: true },
  ];
  let raw = [
    { type: "user_message", text: "remember sapphire", images: [{ data: "private image" }] },
    { type: "tool_call", text: "private tool", detail: { output: "secret" } },
    { type: "reasoning", text: "private reasoning" },
    { type: "assistant_message", text: "sapphire remembered" },
  ];
  const refetch = vi.fn(async (options: { direction: string; cursor?: { seq: number }; limit?: number }) => {
    const all = raw.map((item, i) => ({ seqStart: i + 1, item }));
    const older = options.direction === "tail" ? all : all.filter((e) => e.seqStart < options.cursor!.seq);
    const entries = older.slice(-(options.limit || 100));
    return { entries, epoch: "e", hasOlder: older.length > entries.length, startCursor: entries.length ? { epoch: "e", seq: entries[0].seqStart } : null };
  });
  const refresh = vi.fn(async (id: string) => ({ agent: agents.find((a) => a.id === id) }));
  const paseo = {
    agents: { list: vi.fn(async () => ({ entries: agents.map((agent) => ({ agent })), pageInfo: {} })), ref: (id: string) => ({ refresh: () => refresh(id), timeline: { refetch } }) },
    workspaces: { list: vi.fn(async () => ({ entries: workspaces, pageInfo: {} })), ref: (id: string) => ({ refresh: async () => workspaces.find((w) => w.id === id) }) },
  };
  const store = { read: async () => board } as unknown as BoardStore;
  const service = new SessionContextService(store);
  return { service, api: paseo as unknown as PaseoApi, paseo, agents, board, refetch, refresh, raw: (items: { type: string; text: string }[]) => { raw = items; } };
}

test("same-project native and linked-card sources only; slim metadata", async () => {
  const x = fixture();
  expect((await x.service.sources("t", x.api)).entries).toEqual([
    { id: "a", title: "Source", workspaceName: "Unbound" },
    { id: "b", title: "Linked source", workspaceName: "Linked" },
  ]);
});

test("dialogue only, chronology, attribution; source reads have no side effects", async () => {
  const x = fixture();
  const original = JSON.stringify(x.agents);
  const out = await x.service.read("t", "a", x.api);
  expect(out.text).toContain("User:\nremember sapphire\n\nAssistant:\nsapphire remembered");
  expect(out.text).not.toMatch(/private|secret/);
  expect(out.text).toContain("current task, workspace scope");
  expect(out.truncated).toBe(false);
  expect(JSON.stringify(x.agents)).toBe(original);
  expect(x.refetch).toHaveBeenCalledWith({ direction: "tail", limit: 100, projection: "projected" });
});

test.each(["foreign", "archived", "helper", "internal", "missing"])("reject %s before reading its history", async (id) => {
  const x = fixture();
  await expect(x.service.read("t", id, x.api)).rejects.toThrow();
  expect(x.refetch).not.toHaveBeenCalled();
});

test("pages backwards and retains old-to-new dialogue order", async () => {
  const x = fixture();
  x.raw(Array.from({ length: 205 }, (_, i) => ({ type: "user_message", text: `message-${String(i).padStart(3, "0")}` })));
  const out = await x.service.read("t", "b", x.api);
  expect(x.refetch).toHaveBeenCalledTimes(3);
  expect(out.text.indexOf("message-000")).toBeLessThan(out.text.indexOf("message-204"));
  expect(out.truncated).toBe(false);
});

test("bounds character count, retaining the most recent text and flagging partial messages", async () => {
  const x = fixture();
  x.raw([{ type: "user_message", text: "oldest" + "x".repeat(70_000) + "newest" }]);
  const out = await x.service.read("t", "a", x.api);
  expect(out.truncated).toBe(true);
  expect(out.text).toContain("User:\n[Earlier text omitted]");
  expect(out.text).toContain("newest");
  expect(out.text).not.toContain("oldest");
  expect(out.text.length).toBeLessThan(62_000);
});

test("bounds scanned tool-heavy history without pretending it was complete", async () => {
  const x = fixture();
  x.raw([...Array.from({ length: 1200 }, () => ({ type: "tool_call", text: "ignore" })), { type: "assistant_message", text: "latest" }]);
  const out = await x.service.read("t", "a", x.api);
  expect(x.refetch).toHaveBeenCalledTimes(10);
  expect(out.truncated).toBe(true);
});

test.each([
  { error: "provider read failed" }, { reset: true }, { staleCursor: true },
])("history failures are explicit: %j", async (patch) => {
  const x = fixture();
  x.refetch.mockResolvedValueOnce({ entries: [], epoch: "e", hasOlder: false, startCursor: null, ...patch });
  await expect(x.service.read("t", "a", x.api)).rejects.toThrow();
});

test("empty dialogue fails instead of creating a context-free branch", async () => {
  const x = fixture(); x.raw([{ type: "tool_call", text: "ignored" }]);
  await expect(x.service.read("t", "a", x.api)).rejects.toThrow(/no dialogue/);
});

test("rejects rewrites and non-advancing cursors during paging", async () => {
  for (const epoch of ["rewritten", "e"]) {
    const x = fixture();
    x.refetch.mockResolvedValue({ entries: [{ seqStart: 1, item: { type: "user_message", text: "old" } }], epoch: "e", hasOlder: true, startCursor: { epoch, seq: 1 } });
    await expect(x.service.read("t", "a", x.api)).rejects.toThrow(/advance|changed/);
  }
});

test("fresh authorization detects source reassignment after reading", async () => {
  const x = fixture();
  x.refresh.mockResolvedValueOnce({ agent: x.agents[0] }).mockResolvedValueOnce({ agent: x.agents[2] });
  await expect(x.service.read("t", "a", x.api)).rejects.toThrow(/different project/);
});
