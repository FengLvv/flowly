import { expect, test } from "vitest";
import type { PaseoAgent } from "@getpaseo/client";
import { runtimeGroups } from "./runtime-view";
const a = (extra = {}): PaseoAgent => ({ id: "a", workspaceId: "w", status: "idle", requiresAttention: false, updatedAt: "2026-11-16", ...extra } as PaseoAgent);
const lane = (agents: PaseoAgent[], unknown = false) => runtimeGroups(agents, [], unknown).find(g => g.sessions.length)?.id;
test("each native conversation appears once, even when several share a workspace", () => {
  const one = a(), two = a({ id: "b" }), three = a({ id: "c", workspaceId: "unbound" });
  expect(runtimeGroups([one, two, three, one], [], false).flatMap(g => g.sessions).map(s => s.id)).toEqual(["a", "b", "c"]);
});
test("pending request outranks running; failure and unread go to review", () => {
  expect(lane([a({ status: "running", pendingPermissions: [{}] })])).toBe("attention");
  expect(lane([a({ status: "error" })])).toBe("review");
  expect(lane([a({ requiresAttention: true, attentionReason: "finished" })])).toBe("review");
});
test("running, settled and archived are independent of any task", () => {
  expect(lane([a({ status: "running" })])).toBe("running");
  expect(lane([a({ status: "closed" })])).toBe("idle");
  expect(lane([a({ archivedAt: "now", status: "running" })])).toBe("archived");
});
test("history restoration is not live work; retained failures remain visible", () => {
  expect(lane([a({ status: "initializing", lastUserMessageAt: "before", activeTurn: null })])).toBe("idle");
  expect(lane([a({ status: "initializing", lastUserMessageAt: "before", activeTurn: { startedAt: "now" } })])).toBe("running");
  expect(lane([a({ status: "idle", lastError: "Quota exceeded" })])).toBe("review");
});
test("unknown read state does not look idle or hide known live work", () => {
  expect(lane([a()], true)).toBe("unavailable");
  expect(lane([a({ requiresAttention: undefined })])).toBe("unavailable");
  expect(lane([a({ status: "running" })], true)).toBe("running");
});
test("native child completion does not create user unread; manual unread still works", () => {
  const child = a({ requiresAttention: true, attentionReason: "finished", labels: { "paseo.parent-agent-id": "parent" } });
  expect(lane([child])).toBe("idle");
  const groups = runtimeGroups([child], [{ taskId: "real-card", workspaceId: "w", agentId: "a", token: "manual-unread", readAt: "now" }], false);
  expect(groups.find(g => g.sessions.length)?.id).toBe("review");
});
