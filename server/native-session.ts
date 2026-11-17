import type { PaseoApi } from "@getpaseo/client";
import type { SessionTarget } from "../shared/session-target";

/** Runtime conversations have native workspace scope, never a fabricated task binding. */
export async function nativeSession(paseo: PaseoApi, target: SessionTarget, writable = false) {
  if (!target.workspaceId || target.taskId) throw new Error("Give either a task or workspace target.");
  const [snapshot, workspace] = await Promise.all([
    paseo.agents.ref(target.agentId).refresh(), paseo.workspaces.ref(target.workspaceId).refresh(),
  ]);
  const agent = snapshot?.agent;
  if (!workspace || workspace.id !== target.workspaceId || workspace.archivingAt)
    throw new Error("Workspace is unavailable.");
  if (!agent || agent.id !== target.agentId || agent.workspaceId !== target.workspaceId)
    throw new Error("Session is unavailable or belongs to a different workspace.");
  if (writable && agent.archivedAt) throw new Error("Restore the session before changing its settings.");
  if (writable && agent.providerUnavailable) throw new Error("This session's provider is unavailable.");
  return agent;
}
