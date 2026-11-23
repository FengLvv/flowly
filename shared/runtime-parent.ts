import type { PaseoAgent } from "@getpaseo/client";

export type RuntimeParent = { kind: "workspace"; workspaceId: string }
  | { kind: "pending"; workspaceId: string; error?: string }
  | { kind: "card"; workspaceId: string; taskId: string; projectId: string };
export type RuntimeTarget = { id: string; workspaceId: string; parent?: RuntimeParent };

export function matchesRuntimeCard(parent: RuntimeParent | null | undefined,
  task: { id: string; workspaceId: string; projectId: string } | undefined) {
  return !!parent && parent.kind === "card" && !!task && task.id === parent.taskId && task.workspaceId === parent.workspaceId && task.projectId === parent.projectId;
}

/** Exact saved ownership only; duplicate/incomplete bindings never select an arbitrary card. */
export function runtimeParent(workspaceId: string,
  tasks?: readonly { id: string; workspaceId: string; projectId: string }[], projects?: readonly { id: string }[]): RuntimeParent | null {
  if (!workspaceId) return null;
  if (!tasks || !projects) return { kind: "pending", workspaceId };
  const matches = tasks.filter(task => task.workspaceId === workspaceId);
  const task = matches.length === 1 ? matches[0] : undefined;
  return task && projects.some(project => project.id === task.projectId)
    ? { kind: "card", workspaceId, taskId: task.id, projectId: task.projectId }
    : { kind: "workspace", workspaceId };
}

/** Deduplicate before filtering so a moved native session cannot survive as an old workspace row. */
export function runtimeWorkspaceSessions(workspaceId: string, history: readonly PaseoAgent[], live: readonly PaseoAgent[]) {
  const unique = new Map<string, PaseoAgent>();
  [...history, ...live].forEach(agent => {
    if (!unique.has(agent.id) || unique.get(agent.id)!.updatedAt <= agent.updatedAt) unique.set(agent.id, agent);
  });
  return [...unique.values()].filter(agent => agent.workspaceId === workspaceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
