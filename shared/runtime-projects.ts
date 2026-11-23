import type { Project, Task } from "./model";
import type { RuntimeGroup } from "./runtime-view";

export type RuntimeProjectFilter = { ids: readonly string[]; unlinked: boolean };
export const allRuntimeProjects: RuntimeProjectFilter = { ids: [], unlinked: false };
export type RuntimeProject = Pick<Project, "id" | "title" | "primaryPath" | "paseoProjectId" | "archivedAt">;
type Workspace = { id: string; projectId: string };

/** Flowly identity wins over native ownership for linked/legacy workspaces. Read-only. */
export function runtimeWorkspaceProjects(projects: readonly Pick<Project, "id" | "paseoProjectId">[], tasks: readonly Pick<Task, "workspaceId" | "projectId">[], workspaces: readonly Workspace[]): ReadonlyMap<string, ReadonlySet<string>> {
  const registered = new Set(projects.map(p => p.id));
  const native = new Map<string, Set<string>>(), bound = new Map<string, Set<string>>();
  projects.forEach(p => { if (!p.paseoProjectId) return; const ids = native.get(p.paseoProjectId) ?? new Set(); ids.add(p.id); native.set(p.paseoProjectId, ids); });
  tasks.forEach(task => {
    if (!task.workspaceId || !registered.has(task.projectId)) return;
    const ids = bound.get(task.workspaceId) ?? new Set(); ids.add(task.projectId); bound.set(task.workspaceId, ids);
  });
  workspaces.forEach(w => { if (!bound.has(w.id) && native.has(w.projectId)) bound.set(w.id, native.get(w.projectId)!); });
  return bound;
}

export function toggleRuntimeProject(filter: RuntimeProjectFilter, id: string): RuntimeProjectFilter {
  return { ...filter, ids: filter.ids.includes(id) ? filter.ids.filter(value => value !== id) : [...filter.ids, id] };
}

/** OR within the chooser; subsequent search/range/sort take the intersection. */
export function filterRuntimeProjects(groups: readonly RuntimeGroup[], workspaceProjects: ReadonlyMap<string, ReadonlySet<string>>, filter: RuntimeProjectFilter): readonly RuntimeGroup[] {
  if (!filter.ids.length && !filter.unlinked) return groups;
  const selected = new Set(filter.ids);
  return groups.map(group => ({ ...group, sessions: group.sessions.filter(agent => {
    const ids = agent.workspaceId ? workspaceProjects.get(agent.workspaceId) : undefined;
    return ids?.size ? [...ids].some(id => selected.has(id)) : filter.unlinked;
  }) }));
}
