import { launchKanbanSession } from "./session";
import { expect, test, vi } from "vitest";
import type { PaseoApi } from "@getpaseo/client";
import {
  createPreparedSession,
  sendCardInstruction,
  workspaceSession,
} from "./session";
function fixture() {
  let found: unknown = null;
  const create = vi.fn(async () => ({ id: "allocated" }));
  const refresh = vi.fn(async () => found);
  const paseo = {
    agents: { ref: () => ({ refresh }) },
    workspaces: { ref: () => ({ agents: { create } }) },
  } as unknown as PaseoApi;
  return {
    paseo,
    create,
    refresh,
    found: (value: unknown) => {
      found = value;
    },
  };
}
const options = {
  agentId: "allocated",
  config: { provider: "codex/gpt-6-luna", modeId: "full-access" },
  prompt: "Start",
};
test("uncertain creation response reuses actual session without replaying first prompt", async () => {
  const x = fixture();
  x.create.mockImplementationOnce(async () => {
    x.found({ agent: { id: "allocated", workspaceId: "w" } });
    throw new Error("lost response");
  });
  expect(await createPreparedSession(x.paseo, "w", options)).toEqual({
    id: "allocated",
    recovered: true,
  });
  expect(await createPreparedSession(x.paseo, "w", options)).toEqual({
    id: "allocated",
    recovered: true,
  });
  expect(x.create).toHaveBeenCalledTimes(1);
});
test("creation failure stays a failure; wrong workspace/archived ID and uncertain lookup block provision", async () => {
  const x = fixture();
  x.create.mockRejectedValue(new Error("provider unavailable"));
  await expect(createPreparedSession(x.paseo, "w", options)).rejects.toThrow(
    "provider unavailable",
  );
  for (const agent of [
    { id: "allocated", workspaceId: "other" },
    { id: "allocated", workspaceId: "w", archivedAt: "now" },
  ]) {
    x.found({ agent });
    await expect(createPreparedSession(x.paseo, "w", options)).rejects.toThrow(
      "Prepared session",
    );
  }
  x.found(null);
  x.refresh.mockRejectedValue(new Error("cannot confirm"));
  await expect(createPreparedSession(x.paseo, "w", options)).rejects.toThrow(
    "cannot confirm",
  );
  expect(x.create).toHaveBeenCalledTimes(1);
});

test("follow-up verifies workspace/scope and uses the freshly read execution state", async () => {
  const send = vi.fn(),
    refresh = vi.fn(async () => ({
      agent: { id: "a", workspaceId: "w", status: "running" },
    }));
  const paseo = {
    agents: { ref: () => ({ refresh, send }) },
  } as unknown as PaseoApi;
  const contextRead = vi.fn(async () => ({
    available: true,
    reason: "",
    context: "Current scope",
  }));
  await sendCardInstruction(
    paseo,
    { id: "t", workspaceId: "w" },
    "a",
    contextRead,
    "Continue",
    "interrupt",
  );
  expect(send).toHaveBeenCalledWith(
    "Continue",
    { activeTurnBehavior: "interrupt" },
  );
  refresh.mockResolvedValueOnce({
    agent: { id: "a", workspaceId: "other", status: "running" },
  });
  await expect(
    sendCardInstruction(
      paseo,
      { id: "t", workspaceId: "w" },
      "a",
      contextRead,
      "Wrong",
      "steer",
    ),
  ).rejects.toThrow("different workspace");
  contextRead.mockResolvedValueOnce({
    available: false,
    reason: "Task archived",
    context: "",
  });
  await expect(
    sendCardInstruction(
      paseo,
      { id: "t", workspaceId: "w" },
      "a",
      contextRead,
      "Wrong",
      "steer",
    ),
  ).rejects.toThrow("Task archived");
  expect(send).toHaveBeenCalledTimes(1);
  await expect(
    workspaceSession(
      {
        agents: {
          ref: () => ({
            refresh: async () => ({
              agent: { workspaceId: "w", archivedAt: "now" },
            }),
          }),
        },
      } as unknown as PaseoApi,
      "a",
      "w",
      true,
    ),
  ).rejects.toThrow("archived");
});

test("archived sessions accept a restoring send but not live-only writes", async () => {
  const { workspaceSession } = await import("./session");
  const paseo = {
    agents: { ref: () => ({ refresh: async () => ({ agent: { id: "a", workspaceId: "w", archivedAt: "2026-10-15T00:00:00Z" } }) }) },
  } as never;
  await expect(workspaceSession(paseo, "a", "w", true)).rejects.toThrow(/archived/);
  await expect(workspaceSession(paseo, "a", "w", "restore")).resolves.toMatchObject({ id: "a" });
  await expect(workspaceSession(paseo, "a", "other", "restore")).rejects.toThrow(/different workspace/);
});


test("description launch attaches real bytes once and rejects a stale description", async () => {
  const x = fixture();
  const image = { data: "aW1hZ2U=", mimeType: "image/png" as const };
  const contextRead = vi.fn(async () => ({ available: true, reason: "", context: "Card context", revision: 7 }));
  const prepare = vi.fn(async () => ({ agentId: "allocated", instructions: "Kanban instructions", contextFile: "context", cliPath: "cli", skillPath: "skill" }));
  const choice = { provider: "codex", model: "gpt-6-luna", mode: "full-access", prompt: "Read this picture", images: [image], clientMessageId: "message", operationId: "op", descriptionRevision: 7 };
  const task = { id: "t", workspaceId: "w", title: "Task" };
  x.create.mockResolvedValue({ id: "allocated" });
  await launchKanbanSession({ paseo: x.paseo, contextRead, prepare }, task, choice);
  expect(x.create).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Read this picture", images: [image], clientMessageId: "message" }));
  x.found({ agent: { id: "allocated", workspaceId: "w" } });
  await launchKanbanSession({ paseo: x.paseo, contextRead, prepare }, task, choice);
  expect(x.create).toHaveBeenCalledTimes(1);
  await expect(launchKanbanSession({ paseo: x.paseo, contextRead, prepare }, task, { ...choice, descriptionRevision: 6 })).rejects.toThrow(/Description changed/);
  expect(x.create).toHaveBeenCalledTimes(1);
});

test("image-only card launch supplies its title as first instruction", async () => {
  const x = fixture();
  x.create.mockResolvedValue({ id: "allocated" });
  await launchKanbanSession({
    paseo: x.paseo,
    contextRead: async () => ({ available: true, reason: "", context: "Scope" }),
    prepare: async () => ({ agentId: "allocated", instructions: "Instructions", contextFile: "c", cliPath: "cli", skillPath: "s" }),
  }, { id: "t", title: "Inspect reference", workspaceId: "w" }, {
    provider: "codex", model: "gpt-6-luna", mode: "full-access", operationId: "op", images: [{ data: "cGlj", mimeType: "image/png" }],
  });
  expect(x.create).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Inspect reference" }));
});
