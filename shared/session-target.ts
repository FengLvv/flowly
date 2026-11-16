import { z } from "zod";

const id = z.string().min(1).max(200);
export const sessionTargetFields = { taskId: id.optional(), workspaceId: id.optional(), agentId: id };
export type SessionScope = { taskId?: string; workspaceId?: string };
export type SessionTarget = SessionScope & { agentId: string };
export const validSessionScope = (scope: SessionScope) => !!scope.taskId !== !!scope.workspaceId;
export const sessionScope = (target: string | SessionScope): SessionScope => typeof target === "string" ? { taskId: target } : target;
