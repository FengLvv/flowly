import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PaseoApi } from "@getpaseo/client";
import { nativeSession } from "./native-session";
import { ComposerService, ComposerStore } from "./composer";
import { BoardStore } from "./store";
import { SessionTailService } from "./session-tail";
import { SessionSettingsService } from "./session-settings";
import { SessionReadService, SessionReadStore } from "./session-reads";
import { sessionAttention } from "../shared/session-attention";
import * as rpc from "../shared/rpc";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "flowly-runtime-")); roots.push(root);
  const agent = { id: "a", workspaceId: "w", status: "running", provider: "codex", cwd: root, requiresAttention: false, archivedAt: null as string | null, providerUnavailable: false };
  const workspace = { id: "w", archivingAt: null as string | null };
  const timeline = vi.fn(async () => ({ agent: { ...agent }, entries: [] }));
  const paseo = { agents: { ref: () => ({ refresh: async () => ({ agent: { ...agent } }), timeline: { refetch: timeline } }) }, workspaces: { ref: () => ({ refresh: async () => ({ ...workspace }) }) } } as unknown as PaseoApi;
  const board = new BoardStore(join(root, "board"));
  const store = new ComposerStore(join(root, "composer")), send = vi.fn(async () => {});
  const composer = new ComposerService(store, board, send);
  return { root, agent, workspace, paseo, timeline, board, store, send, composer };
}
test("RPC targets accept existing cards or native workspaces, never both or neither", () => {
  const endpoints = [
    [rpc.saveDraft, { text: "hello" }], [rpc.queueMessage, { text: "hello" }],
    [rpc.sendQueuedNow, { id: "message" }], [rpc.sessionTail, { limit: 5 }],
    [rpc.sessionImage, { src: "/tmp/a.png" }], [rpc.configureSession, { stop: true }],
  ] as const;
  endpoints.forEach(([endpoint, fields]) => {
    expect(endpoint.input.safeParse({ ...fields, agentId: "a", taskId: "t" }).success).toBe(true);
    expect(endpoint.input.safeParse({ ...fields, agentId: "a", workspaceId: "w" }).success).toBe(true);
    expect(endpoint.input.safeParse({ ...fields, agentId: "a" }).success).toBe(false);
    expect(endpoint.input.safeParse({ ...fields, agentId: "a", taskId: "t", workspaceId: "w" }).success).toBe(false);
  });
  expect(rpc.saveDraft.input.safeParse({ taskId: "t", agentId: "a", text: "old" }).success).toBe(true);
  expect(rpc.saveDraft.input.safeParse({ workspaceId: "w", agentId: "a", text: "new" }).success).toBe(true);
});
test("unbound session authorization rejects moved, archiving and wrong-ID resources", async () => {
  const x = await fixture();
  expect((await nativeSession(x.paseo, { workspaceId: "w", agentId: "a" })).id).toBe("a");
  x.agent.workspaceId = "moved";
  await expect(nativeSession(x.paseo, { workspaceId: "w", agentId: "a" })).rejects.toThrow(/different workspace/);
  x.agent.workspaceId = "w"; x.workspace.archivingAt = "now";
  await expect(nativeSession(x.paseo, { workspaceId: "w", agentId: "a" })).rejects.toThrow(/Workspace/);
  x.workspace.archivingAt = null;
  await expect(nativeSession(x.paseo, { workspaceId: "w", agentId: "other" })).rejects.toThrow(/Session/);
  await expect(nativeSession(x.paseo, { taskId: "t", workspaceId: "w", agentId: "a" })).rejects.toThrow(/either/);
});
test("native drafts survive board cleanup; queue drains only its saved workspace target", async () => {
  const x = await fixture(), target = { workspaceId: "w", agentId: "a" };
  await x.composer.saveDraft({ ...target, text: "keep" }, x.paseo);
  await x.composer.push({ ...target, text: "exact follow-up" }, x.paseo); await x.composer.idle();
  await x.composer.drainAll(x.paseo); await x.composer.idle();
  expect((await x.store.read()).sessions.a.draft).toBe("keep");
  x.agent.status = "idle"; x.agent.workspaceId = "moved";
  expect(await x.composer.drain("a", x.paseo)).toBe(false); expect(x.send).not.toHaveBeenCalled();
  x.agent.workspaceId = "w";
  expect(await x.composer.drain("a", x.paseo)).toBe(true);
  expect(x.send).toHaveBeenCalledWith(x.paseo, "a", "exact follow-up", false, [], expect.any(String));
  expect((await x.board.read()).tasks).toEqual([]);
});
test("native transcript and read state work without a task, rejecting workspace changes", async () => {
  const x = await fixture(), target = { workspaceId: "w", agentId: "a" };
  await new SessionTailService(x.board).tail({ ...target, limit: 5 }, x.paseo);
  expect(x.timeline).toHaveBeenCalledOnce();
  const reads = new SessionReadStore(join(x.root, "reads")), service = new SessionReadService(x.board, reads);
  x.agent.providerUnavailable = true;
  await service.markUnread(target, x.paseo);
  expect(sessionAttention(x.agent as never, "existing-card", (await reads.read()).receipts).unread).toBe(true);
  await service.mark(target, x.paseo);
  expect(sessionAttention(x.agent as never, undefined, (await reads.read()).receipts).unread).toBe(false);
  x.agent.workspaceId = "moved";
  await expect(service.markUnread(target, x.paseo)).rejects.toThrow(/different workspace/);
  await expect(new SessionTailService(x.board).tail({ ...target, limit: 5 }, x.paseo)).rejects.toThrow(/different workspace/);
  expect(x.timeline).toHaveBeenCalledOnce();
});
test("native model mutation reauthorizes after connection and always closes on stale scope", async () => {
  const x = await fixture();
  const client = { setAgentModel: vi.fn(), close: vi.fn(async () => {}) };
  const paseo = Object.assign(x.paseo, { providers: { listModels: async () => ({ models: [{ id: "next", isSelectable: true }] }) } });
  const connect = vi.fn(async () => { x.agent.workspaceId = "moved"; return client; });
  const service = new SessionSettingsService(x.board, undefined, undefined, connect as never);
  await expect(service.apply({ workspaceId: "w", agentId: "a", modelId: "next" }, paseo)).rejects.toThrow();
  expect(client.setAgentModel).not.toHaveBeenCalled();
  expect(client.close).toHaveBeenCalledOnce();
});
