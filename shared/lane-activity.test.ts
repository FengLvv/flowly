import { expect, test } from "vitest";
import type { PaseoAgent } from "@getpaseo/client";
import { activeTaskLanes, projectLaneMotion } from "./lane-activity";
import { SUMMARIZER_LABELS } from "./summary";

const a = (extra = {}) => ({ id: "a", workspaceId: "w", status: "idle", updatedAt: "2026-11-17T00:00:00Z", requiresAttention: false, ...extra }) as PaseoAgent;
const task = { workspaceId: "w", status: "todo" as const, archivedAt: null };
const lanes = (agents: PaseoAgent[], tasks = [task]) => [...activeTaskLanes(tasks, new Map([["w", agents]]))];

test("lane activity follows exact workspace conversations regardless of business stage", () => {
  expect(lanes([a({ status: "running" })])).toEqual(["todo"]);
  expect(lanes([a({ status: "running" })], [{ ...task, workspaceId: "other" }])).toEqual([]);
  expect(lanes([a({ status: "running" })], [{ ...task, archivedAt: "2026-11-17T00:00:00Z" } as never])).toEqual([]);
  expect(lanes([a({ status: "running", labels: { "paseo.parent-agent-id": "parent" } })])).toEqual(["todo"]);
});
test("pending input can animate a lane without being actual running work", () => {
  expect(lanes([a({ pendingPermissions: [{ id: "p" }] })])).toEqual(["todo"]);
  expect(lanes([a({ status: "running", attentionReason: "permission", requiresAttention: true })])).toEqual(["todo"]);
  expect(lanes([a({ requiresAttention: true, attentionReason: "finished" })])).toEqual([]);
});
test("settled, history-only, failed, archived and helper conversations do not animate", () => {
  expect(lanes([a(), a({ id: "b", status: "closed" }), a({ id: "c", status: "error" }),
    a({ id: "d", status: "initializing", lastUserMessageAt: "before", activeTurn: null }),
    a({ id: "e", status: "running", archivedAt: "now" }),
    a({ id: "f", status: "running", labels: SUMMARIZER_LABELS })])).toEqual([]);
  expect(lanes([a({ status: "initializing" })])).toEqual(["todo"]);
  expect(lanes([a({ status: "initializing", lastUserMessageAt: "before", activeTurn: { startedAt: "now" } })])).toEqual(["todo"]);
});
test("newer stopped snapshot wins, including during paged reconciliation", () => {
  expect(lanes([a({ status: "running" }), a({ status: "idle", updatedAt: "2026-11-17T01:00:00Z" })])).toEqual([]);
  expect(lanes([a({ status: "running", updatedAt: "2026-11-17T01:00:00Z" }), a()])).toEqual(["todo"]);
});
test("spin only non-symmetric circle glyphs; keep symmetric circles and pictograms upright", () => {
  expect(["design", "test", "in_review"].map(s => projectLaneMotion(s as never))).toEqual(["spin", "spin", "spin"]);
  expect(["todo", "development", "blocked", "done", "cancelled"].map(s => projectLaneMotion(s as never))).toEqual(Array(5).fill("breathe"));
});
