import type { PaseoAgent } from "@getpaseo/client";
import { sessionAttention, type SessionReadReceipt } from "./session-attention";

export const runtimeLanes = ["attention", "running", "review", "idle", "archived", "unavailable"] as const;
export type RuntimeLane = (typeof runtimeLanes)[number];
export type RuntimeGroup = { id: RuntimeLane; sessions: PaseoAgent[] };

/** Native conversations, independent of Flowly task identity or business state. */
export function runtimeGroups(agents: readonly PaseoAgent[], receipts: readonly SessionReadReceipt[], readUnavailable: boolean): RuntimeGroup[] {
  const groups = runtimeLanes.map(id => ({ id, sessions: [] as PaseoAgent[] }));
  const lanes = new Map(groups.map(g => [g.id, g.sessions]));
  const unique = new Map<string, PaseoAgent>();
  agents.forEach(a => { if (!unique.has(a.id) || unique.get(a.id)!.updatedAt <= a.updatedAt) unique.set(a.id, a); });
  unique.forEach(a => {
    const state = sessionAttention(a, undefined, receipts);
    // Initializing an old dialogue for history alone is not a running turn.
    const restoring = a.status === "initializing" && !!a.lastUserMessageAt && !a.activeTurn;
    const failed = state.error || (!!a.lastError && (a.status === "idle" || a.status === "closed" || restoring));
    const lane: RuntimeLane = a.archivedAt ? "archived"
      : state.permission ? "attention"
      : failed ? "review"
      : state.running || (state.starting && !restoring) ? "running"
      : !readUnavailable && state.unread ? "review"
      : readUnavailable || a.requiresAttention === undefined || !a.workspaceId ? "unavailable" : "idle";
    lanes.get(lane)!.push(a);
  });
  return groups;
}
