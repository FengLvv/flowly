import { expect, test, vi } from "vitest";
import { conversationMatches, searchSession } from "./session-search";
import { sessionSearch } from "../shared/rpc";

function fixture() {
  const agent = { id: "a", workspaceId: "w" };
  const page = { agent, epoch: "e", entries: [] as { item: unknown }[], hasNewer: false, endCursor: { epoch: "e", seq: 2 } };
  const refetch = vi.fn(async () => page), refresh = vi.fn(async () => ({ agent }));
  const paseo = { agents: { ref: () => ({ refresh, timeline: { refetch } }) }, workspaces: { ref: () => ({ refresh: async () => ({ id: "w" }) }) } } as never;
  return { agent, page, refetch, refresh, paseo, input: { agentId: "a", workspaceId: "w", query: "hello world" } };
}
test("schema rejects empty/oversized search, mixed scope and malformed cursors", () => {
  const x = fixture(); expect(sessionSearch.input.safeParse(x.input).success).toBe(true);
  for (const extra of [{ query: " " }, { query: "x".repeat(201) }, { taskId: "t" }, { workspaceId: "" }, { cursor: { epoch: "e", seq: -1 } }]) expect(sessionSearch.input.safeParse({ ...x.input, ...extra }).success).toBe(false);
});
test("conversation match uses all words in bounded chunks, ignoring case", () => {
  expect(conversationMatches("HELLO then world", "hello world")).toBe(true);
  expect(conversationMatches("hello", "hello world")).toBe(false);
  expect(conversationMatches("x".repeat(4094) + "needle", "needle")).toBe(true);
  expect(conversationMatches({ text: "secret" }, "secret")).toBe(false);
});
test("search reads a bounded projected page, excludes tool payloads and sends no transcript", async () => {
  const x = fixture(); x.page.entries = [{ item: { type: "tool_call", text: "hello world" } }, { item: { type: "assistant_message", text: "Hello world" } }];
  expect(await searchSession(x.input, x.paseo)).toEqual({ matched: true, nextCursor: null });
  expect(x.refetch).toHaveBeenCalledWith({ direction: "after", limit: 16, projection: "projected" });
  x.page.entries = [{ item: { type: "tool_call", text: "hello world" } }]; expect((await searchSession(x.input, x.paseo)).matched).toBe(false);
});
test("workspace mismatch rejects before reads and moves during reads reject afterwards", async () => {
  const x = fixture(); x.agent.workspaceId = "wrong";
  await expect(searchSession(x.input, x.paseo)).rejects.toThrow(/different workspace/); expect(x.refetch).not.toHaveBeenCalled();
  x.agent.workspaceId = "w"; x.refetch.mockImplementationOnce(async () => { x.agent.workspaceId = "moved"; return x.page; });
  await expect(searchSession(x.input, x.paseo)).rejects.toThrow(/different workspace/);
});
test("cursor advances or rejects; timeline errors never become no matches", async () => {
  const x = fixture(); x.page.hasNewer = true;
  expect(await searchSession(x.input, x.paseo)).toEqual({ matched: false, nextCursor: { epoch: "e", seq: 2 } });
  await expect(searchSession({ ...x.input, cursor: { epoch: "e", seq: 2 } }, x.paseo)).rejects.toThrow(/advance/);
  await expect(searchSession({ ...x.input, cursor: { epoch: "changed", seq: 1 } }, x.paseo)).rejects.toThrow(/History changed/);
  Object.assign(x.page, { error: "Provider unavailable" }); await expect(searchSession(x.input, x.paseo)).rejects.toThrow(/Provider unavailable/);
});

test("real daemon empty initial window hasNewer=true is terminal, but empty paging is not", async () => {
  const x = fixture(); Object.assign(x.page, { hasNewer: true, startCursor: null, endCursor: null });
  expect(await searchSession(x.input, x.paseo)).toEqual({ matched: false, nextCursor: null });
  await expect(searchSession({ ...x.input, cursor: { epoch: "e", seq: 1 } }, x.paseo)).rejects.toThrow(/advance/);
});
