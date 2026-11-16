import { afterEach, expect, test, vi } from "vitest";
import type { PaseoApi } from "@getpaseo/client";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BoardStore } from "./store";
import { SessionSettingsService } from "./session-settings";
import { configureSession } from "../shared/rpc";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function setup(agent: Record<string, unknown>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ultra-settings-")));
  roots.push(root);
  const store = new BoardStore(join(root, "data"));
  const now = new Date().toISOString();
  await store.mutate((b) => {
    b.projects.push({ id: "p", paseoProjectId: "n", title: "P", description: "", primaryPath: root, repos: [root], revision: 1, createdAt: now, updatedAt: now, archivedAt: null });
    b.tasks.push({ id: "t", projectId: "p", workspaceId: "w", sourcePath: root, repoPaths: [root], title: "T", description: "", status: "todo", priority: "normal", position: 0, revision: 1, operationId: "o", createdAt: now, updatedAt: now, archivedAt: null });
  });
  const calls: string[][] = [];
  const listModels = vi.fn(async () => ({ models: [{ id: "next-model", isSelectable: true }, { id: "hidden", isSelectable: false }], error: null as string | null }));
  const paseo = { agents: { ref: () => ({ refresh: async () => ({ agent }) }) }, providers: { listModels } } as unknown as PaseoApi;
  const client = { setAgentModel: vi.fn(async (..._args: unknown[]) => {}), setAgentFeature: vi.fn(async (..._args: unknown[]) => {}), close: vi.fn(async () => {}) };
  const connect = vi.fn(async (..._args: unknown[]) => client);
  const service = new SessionSettingsService(store, async (_bin, args) => {
    calls.push(args);
    return "";
  }, async () => "/bin/paseo", connect as never);
  return { service, paseo, calls, listModels, client, connect, store };
}
const live = { id: "a1", workspaceId: "w", archivedAt: null, availableModes: [{ id: "plan" }, { id: "bypassPermissions" }] };

const configurable = { ...live, provider: "codex", cwd: "fixture", features: [
  { id: "fast_mode", type: "toggle", value: false },
  { id: "plan", type: "select", value: "off", options: [{ id: "off" }, { id: "on" }] },
] };

test("model and provider feature changes target the existing agent and always close the connection", async () => {
  const x = await setup(configurable);
  expect(await x.service.apply({ taskId: "t", agentId: "a1", modelId: "next-model" }, x.paseo)).toEqual({ applied: ["model"] });
  expect(x.listModels).toHaveBeenCalledWith("codex", { cwd: "fixture" });
  expect(x.client.setAgentModel).toHaveBeenCalledWith("a1", "next-model");
  await x.service.apply({ taskId: "t", agentId: "a1", feature: { id: "fast_mode", value: true } }, x.paseo);
  await x.service.apply({ taskId: "t", agentId: "a1", feature: { id: "plan", value: "on" } }, x.paseo);
  expect(x.client.setAgentFeature.mock.calls).toEqual([["a1", "fast_mode", true], ["a1", "plan", "on"]]);
  expect(x.client.close).toHaveBeenCalledTimes(3);
  expect(x.calls).toEqual([]);
});

test.each([
  { modelId: "hidden" }, { modelId: "unknown" },
  { feature: { id: "unknown", value: true } }, { feature: { id: "fast_mode", value: "true" } },
  { feature: { id: "plan", value: true } }, { feature: { id: "plan", value: "other" } },
  { modelId: "next-model", modeId: "plan" },
])("rejects unadvertised/ill-typed or mixed changes before connecting: %j", async (change) => {
  const x = await setup(configurable);
  await expect(x.service.apply({ taskId: "t", agentId: "a1", ...change }, x.paseo)).rejects.toThrow();
  expect(x.connect).not.toHaveBeenCalled();
});

test("catalog errors are preserved without opening a write connection", async () => {
  const x = await setup(configurable);
  x.listModels.mockResolvedValue({ models: [], error: "Provider unavailable" });
  await expect(x.service.apply({ taskId: "t", agentId: "a1", modelId: "next-model" }, x.paseo)).rejects.toThrow("Provider unavailable");
  expect(x.connect).not.toHaveBeenCalled();
});

test("rejects overlap, releases the lock after a provider failure and closes each client", async () => {
  const x = await setup(configurable);
  let reject!: (error: Error) => void;
  x.client.setAgentModel.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const first = x.service.apply({ taskId: "t", agentId: "a1", modelId: "next-model" }, x.paseo);
  await vi.waitFor(() => expect(x.client.setAgentModel).toHaveBeenCalled());
  await expect(x.service.apply({ taskId: "t", agentId: "a1", feature: { id: "fast_mode", value: true } }, x.paseo)).rejects.toThrow(/already in progress/);
  reject(new Error("Provider refused"));
  await expect(first).rejects.toThrow("Provider refused");
  expect(x.client.close).toHaveBeenCalledTimes(1);
  await x.service.apply({ taskId: "t", agentId: "a1", modelId: "next-model" }, x.paseo);
  expect(x.client.close).toHaveBeenCalledTimes(2);
});

test.each(["task", "project", "session", "feature"])("rechecks %s after opening the connection", async (change) => {
  const agent = structuredClone(configurable);
  const x = await setup(agent);
  x.connect.mockImplementationOnce(async () => {
    if (change === "session") agent.workspaceId = "other";
    else if (change === "feature") agent.features = [];
    else await x.store.mutate((b) => { (change === "task" ? b.tasks[0] : b.projects[0]).archivedAt = "now"; });
    return x.client;
  });
  await expect(x.service.apply({ taskId: "t", agentId: "a1", feature: { id: "fast_mode", value: true } }, x.paseo)).rejects.toThrow();
  expect(x.client.setAgentFeature).not.toHaveBeenCalled();
  expect(x.client.close).toHaveBeenCalledTimes(1);
});

test("new RPC changes validate false values and reject mixed/unknown fields", () => {
  const parse = (change: object) => configureSession.input.safeParse({ taskId: "t", agentId: "a1", ...change }).success;
  expect(parse({ modelId: "provider/model-id" })).toBe(true);
  expect(parse({ feature: { id: "fast_mode", value: false } })).toBe(true);
  expect(parse({ feature: { id: "speed", value: "normal" } })).toBe(true);
  expect(parse({ feature: { id: "speed", value: {} } })).toBe(false);
  expect(parse({ modelId: "model", modeId: "plan" })).toBe(false);
  expect(parse({ feature: { id: "fast_mode", value: true }, stop: true })).toBe(false);
  expect(parse({ modelId: "model", unexpected: true })).toBe(false);
});

test("reasoning, permissions and stop go to the CLI as argument arrays", async () => {
  const x = await setup(live);
  const result = await x.service.apply({ taskId: "t", agentId: "a1", thinkingOptionId: "high", modeId: "plan", stop: true }, x.paseo);
  expect(result.applied).toEqual(["stopped", "reasoning", "permissions"]);
  expect(x.calls.map((c) => c.slice(0, 4))).toEqual([
    ["agent", "stop", "a1", "--home"],
    ["agent", "update", "a1", "--thinking"],
    ["agent", "mode", "a1", "plan"],
  ]);
  expect(x.calls[1][4]).toBe("high");
});

test("rejects other workspaces, archived sessions and unknown modes without running the CLI", async () => {
  for (const [agent, pattern] of [
    [{ ...live, workspaceId: "other" }, /different workspace/],
    [{ ...live, archivedAt: "2026-10-15T00:00:00Z" }, /Restore/],
  ] as const) {
    const x = await setup(agent);
    await expect(x.service.apply({ taskId: "t", agentId: "a1", modeId: "plan" }, x.paseo)).rejects.toThrow(pattern);
    expect(x.calls).toEqual([]);
  }
  const x = await setup(live);
  await expect(x.service.apply({ taskId: "t", agentId: "a1", modeId: "yolo" }, x.paseo)).rejects.toThrow(/not available/);
  expect(x.calls).toEqual([]);
});

test("RPC input refuses option-like IDs and empty changes", () => {
  const parse = (i: unknown) => configureSession.input.safeParse(i).success;
  expect(parse({ taskId: "t", agentId: "a1", thinkingOptionId: "high" })).toBe(true);
  expect(parse({ taskId: "t", agentId: "a1", thinkingOptionId: "--home" })).toBe(false);
  expect(parse({ taskId: "t", agentId: "-a", stop: true })).toBe(false);
  expect(parse({ taskId: "t", agentId: "a1" })).toBe(false);
});

test("renaming passes one --name= argument, so a dash-leading title is never an option", async () => {
  const x = await setup(live);
  const result = await x.service.apply({ taskId: "t", agentId: "a1", title: "--stop me" }, x.paseo);
  expect(result.applied).toEqual(["title"]);
  expect(x.calls[0].slice(0, 4)).toEqual(["agent", "update", "a1", "--name=--stop me"]);
  const parse = (title: unknown) => configureSession.input.safeParse({ taskId: "t", agentId: "a1", title }).success;
  expect(parse("  Fix login  ")).toBe(true);
  expect(parse("   ")).toBe(false);
  expect(parse("two\nlines")).toBe(false);
  expect(configureSession.input.parse({ taskId: "t", agentId: "a1", title: "  Fix login  " }).title).toBe("Fix login");
});
