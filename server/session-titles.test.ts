import { describe, expect, test, vi } from "vitest";
import type { PaseoApi } from "@getpaseo/client";
import { SessionTitles } from "./session-titles";
import { parseSessionTitle, provisionalTitle, sessionTitleValues } from "../shared/session-titles";

function fixture() {
  const agent = { id: "source", workspaceId: "workspace", cwd: "/repo", parentAgentId: null as string | null,
    title: "fix login", archivedAt: null as string | null, background: false, labels: {} as Record<string, string>, providerUnavailable: false };
  const config = { enabled: true, models: ["claude/haiku"] };
  const entries = [{ item: { type: "user_message", text: "fix login\nDetailed instructions" }, turnId: "first" }];
  const page = { entries, hasNewer: false, startCursor: null, endCursor: null, reset: false, error: null };
  const timeline = vi.fn(async () => page);
  const create = vi.fn(async (_options: unknown) => helper);
  const wait = vi.fn(async (_timeout: number): Promise<{status: string; lastMessage?: string; error?: string; final?: {pendingPermissions: {id: string}[]}}> => ({ status: "idle", lastMessage: "Repair login validation" }));
  const helper = { id: "owned-helper", archive: vi.fn(async () => {}), waitForFinish: wait, respondToPermission: vi.fn(async () => {}) };
  const remove = vi.fn(async (owned: { id: string; archive(): Promise<unknown> }) => { await owned.archive(); });
  const rename = vi.fn(async (id: string, title: string) => { if (id !== agent.id) throw new Error("Wrong source"); agent.title = title; });
  const refresh = vi.fn(async () => ({ agent: { ...agent } }));
  const workspace = { id: "workspace", archivingAt: null as string | null, agents: { create }, refresh: vi.fn(async () => ({ id: workspace.id, archivingAt: workspace.archivingAt })) };
  const providers = { listAvailable: vi.fn(async () => ({ providers: [{ provider: "claude", available: true }] })), listModels: vi.fn(async () => ({ models: [{ id: "haiku" }], error: null })) };
  const paseo = { agents: { ref: () => ({ refresh, timeline: { refetch: timeline } }) }, workspaces: { ref: () => workspace }, providers } as unknown as PaseoApi;
  const service = new SessionTitles(async () => config, async () => "zh-CN", rename, remove, 1234);
  const run = (turnId: string | null = "first") => service.turnStarted({ ...agent }, turnId, paseo);
  return { agent, config, page, entries, timeline, create, helper, wait, remove, rename, refresh, workspace, providers, service, run, paseo };
}

describe("automatic conversation titles", () => {
  test("is off by default and invalid settings do not opt in", () => {
    expect(sessionTitleValues(undefined)).toEqual({ enabled: false });
    expect(sessionTitleValues({ enabled: "yes" })).toEqual({ enabled: false });
    expect(sessionTitleValues({ enabled: true })).toEqual({ enabled: true });
  });

  test("off reads no timeline, creates no helper and never renames", async () => {
    const x = fixture(); x.config.enabled = false;
    await x.run();
    expect(x.refresh).not.toHaveBeenCalled(); expect(x.timeline).not.toHaveBeenCalled();
    expect(x.create).not.toHaveBeenCalled(); expect(x.rename).not.toHaveBeenCalled();
  });

  test("uses the first prompt and language in one read-only child, cleans it, and renames only the native source", async () => {
    const x = fixture(); await x.run();
    expect(x.create).toHaveBeenCalledWith(expect.objectContaining({ parent: "source", background: true, labels: { flowly: "summarizer" }, config: expect.objectContaining({ provider: "claude/haiku", modeId: "plan" }) }));
    const call = x.create.mock.calls[0][0] as {prompt: string; env?: unknown};
    expect(call.prompt).toContain("Simplified Chinese"); expect(call.prompt).toContain("fix login");
    expect(call.env).toBeUndefined();
    expect(x.wait).toHaveBeenCalledWith(1234);
    expect(x.remove).toHaveBeenCalledWith(x.helper); expect(x.helper.archive).toHaveBeenCalledTimes(1);
    expect(x.rename).toHaveBeenCalledExactlyOnceWith("source", "Repair login validation");
    expect(x.workspace.id).toBe("workspace"); expect(x.refresh.mock.calls.length).toBeGreaterThan(2);
  });

  test.each(["Manual name", "Flowly card goal"])("keeps explicit title %s", async title => {
    const x = fixture(); x.agent.title = title; await x.run();
    expect(x.create).not.toHaveBeenCalled(); expect(x.rename).not.toHaveBeenCalled();
  });

  test("blank title can be generated", async () => {
    const x = fixture(); x.agent.title = ""; await x.run(); expect(x.rename).toHaveBeenCalledTimes(1);
  });

  test.each([null, "second"])("does not backfill or rename a later turn (%s)", async turnId => {
    const x = fixture(); await x.run(turnId); expect(x.create).not.toHaveBeenCalled();
  });

  test.each(["child", "background", "summarizer", "legacy", "archived", "provider", "workspace"])("excludes %s", async kind => {
    const x = fixture();
    if (kind === "child") x.agent.parentAgentId = "parent";
    if (kind === "background") x.agent.background = true;
    if (kind === "summarizer") x.agent.labels = { flowly: "summarizer" };
    if (kind === "legacy") x.agent.labels = { "ultra-kanban": "summarizer" };
    if (kind === "archived") x.agent.archivedAt = "now";
    if (kind === "provider") x.agent.providerUnavailable = true;
    if (kind === "workspace") x.workspace.archivingAt = "now";
    await x.run(); expect(x.create).not.toHaveBeenCalled(); expect(x.rename).not.toHaveBeenCalled();
  });

  test.each(["rename", "move", "cwd", "archive", "disable", "dispose", "child", "workspace"])("%s during generation suppresses the stale write and cleans helper", async change => {
    const x = fixture();
    x.wait.mockImplementation(async () => {
      if (change === "rename") x.agent.title = "My newer title";
      if (change === "move") x.agent.workspaceId = "other";
      if (change === "cwd") x.agent.cwd = "/other";
      if (change === "archive") x.agent.archivedAt = "now";
      if (change === "disable") x.config.enabled = false;
      if (change === "dispose") x.service.dispose();
      if (change === "child") x.agent.labels = { "paseo.parent-agent-id": "parent" };
      if (change === "workspace") x.workspace.archivingAt = "now";
      return { status: "idle", lastMessage: "Old suggestion" };
    });
    await x.run(); expect(x.rename).not.toHaveBeenCalled(); expect(x.remove).toHaveBeenCalledWith(x.helper);
  });

  test.each(["failed", "timeout", "invalid", "throw"])("%s leaves the title and cleans the owned helper, no repeated attempt", async failure => {
    const x = fixture();
    x.wait.mockImplementation(async () => { if (failure === "throw") throw new Error("provider error"); return { status: failure === "invalid" ? "idle" : failure, lastMessage: "Title\nExplanation" }; });
    await x.run(); await x.run();
    expect(x.rename).not.toHaveBeenCalled(); expect(x.agent.title).toBe("fix login"); expect(x.remove).toHaveBeenCalledTimes(1);
  });

  test("permission requests are denied and cleanup still runs", async () => {
    const x = fixture();
    x.wait.mockResolvedValueOnce({ status: "permission", final: { pendingPermissions: [{ id: "tool" }] } });
    await x.run();
    expect(x.helper.respondToPermission).toHaveBeenCalledWith(expect.objectContaining({ requestId: "tool", response: expect.objectContaining({ behavior: "deny" }) }));
    expect(x.remove).toHaveBeenCalledTimes(1); expect(x.rename).toHaveBeenCalledTimes(1);
  });

  test("duplicate hooks during checks and after success run once", async () => {
    const x = fixture(); await Promise.all([x.run(), x.run(), x.run()]); await x.run();
    expect(x.create).toHaveBeenCalledTimes(1); expect(x.rename).toHaveBeenCalledTimes(1);
  });

  test("at most two starts do any work, no queued history/model work", async () => {
    const x = fixture(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    x.refresh.mockImplementation(async () => { await gate; return { agent: { ...x.agent } }; });
    const first = x.run();
    const second = x.service.turnStarted({ ...x.agent, id: "second" }, "first", x.paseo);
    await x.service.turnStarted({ ...x.agent, id: "third" }, "first", x.paseo);
    await vi.waitFor(() => expect(x.refresh).toHaveBeenCalledTimes(2));
    expect(x.refresh).toHaveBeenCalledTimes(2);
    release(); await Promise.all([first, second]);
    // The second fixture cannot pass the refreshed source-ID guard.
    expect(x.create).toHaveBeenCalledTimes(1);
  });

  test("empty history and cursor errors keep the old title", async () => {
    const x = fixture(); x.entries.length = 0; x.page.hasNewer = true;
    await x.run(); expect(x.create).not.toHaveBeenCalled();
    x.page.entries.push({ item: { type: "tool_call", text: "ignore" }, turnId: "first" });
    await x.run(); expect(x.create).not.toHaveBeenCalled();
  });

  test("only the first 1000 characters go to the helper", async () => {
    const x = fixture(); x.entries[0].item.text = "a".repeat(1200) + "DO_NOT_SEND"; x.agent.title = "a".repeat(60);
    await x.run(); expect((x.create.mock.calls[0][0] as {prompt: string}).prompt).not.toContain("DO_NOT_SEND");
  });
});

test("Paseo provisional title uses its first nonempty line, collapsed spaces and 60 characters", () => {
  expect(provisionalTitle("\n  fix   login  \nMore")).toBe("fix login");
  expect(provisionalTitle("a".repeat(80))).toHaveLength(60); expect(provisionalTitle("   ")).toBe("");
});

test.each([null, "", "line\nbreak", "x".repeat(81), "\"quoted\"", "`code`", "contains\u0000null"])("rejects malformed output %j", text => {
  expect(() => parseSessionTitle(text)).toThrow();
});
