import type { PaseoAgent } from "@getpaseo/client";
import type { Status, Task } from "./model";
import { runtimeGroups } from "./runtime-view";
import { isSummarizer } from "./summary";

/** Same native waiting/running classification as Runtime, never the task's business stage. */
export function activeTaskLanes(tasks: readonly Pick<Task, "status" | "workspaceId" | "archivedAt">[],
  byWorkspace: ReadonlyMap<string, readonly PaseoAgent[]>): ReadonlySet<Status> {
  const active = new Set<Status>();
  tasks.forEach(task => {
    if (task.archivedAt || active.has(task.status)) return;
    const agents = (byWorkspace.get(task.workspaceId) || []).filter(a => !isSummarizer(a));
    if (runtimeGroups(agents, [], true).some(g => (g.id === "running" || g.id === "attention") && g.sessions.length)) active.add(task.status);
  });
  return active;
}

/** Symmetric plain circles breathe; rotate only glyphs whose movement is visible. */
export const projectLaneMotion = (status: Status) =>
  status === "design" || status === "test" || status === "in_review" ? "spin" as const : "breathe" as const;
