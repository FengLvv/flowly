import type { PaseoApi } from "@getpaseo/client";
import type { BoardStore } from "./store";
import { paseoHome } from "./service";
import { resolvePaseoCli, runPaseo } from "./paseo-cli";
import { openLocalDaemon } from "./local-daemon";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { logFailure } from "./error-report";

type Run = (file: string, args: string[]) => Promise<string>;
const defaultRun: Run = (file, args) => runPaseo(args, { timeout: 20000, maxBuffer: 1 << 20 }, file);

export type SessionSettingsInput = {
  taskId: string;
  agentId: string;
  thinkingOptionId?: string;
  modeId?: string;
  modelId?: string;
  feature?: { id: string; value: boolean | string };
  stop?: boolean;
  title?: string;
};

/** Validated, card-scoped session setting changes for Kanban sessions. */
export class SessionSettingsService {
  private readonly pending = new Set<string>();
  constructor(
    readonly store: BoardStore,
    readonly run: Run = defaultRun,
    readonly cli: () => Promise<string> = () => resolvePaseoCli(),
    readonly connect: typeof openLocalDaemon = openLocalDaemon,
  ) {}

  async apply(input: SessionSettingsInput, paseo: PaseoApi) {
    if (this.pending.has(input.agentId)) throw new Error("A session settings change is already in progress.");
    this.pending.add(input.agentId);
    try {
      return await this.applyChange(input, paseo);
    } finally {
      this.pending.delete(input.agentId);
    }
  }

  private async applyChange(input: SessionSettingsInput, paseo: PaseoApi) {
    // Also enforce single-field runtime changes for non-RPC callers.
    if ((input.modelId || input.feature) && [input.modelId, input.feature, input.thinkingOptionId, input.modeId, input.stop || undefined, input.title].filter((v) => v !== undefined).length !== 1)
      throw new Error("Change one model or provider feature at a time.");
    const board = await this.store.read();
    const task = board.tasks.find((t) => t.id === input.taskId);
    if (!task) throw new Error("Task not found.");
    if (task.archivedAt || !board.projects.some((p) => p.id === task.projectId && !p.archivedAt))
      throw new Error("Restore the task and project before changing session settings.");
    const snapshot = await paseo.agents.ref(input.agentId).refresh();
    const agent = snapshot?.agent;
    if (!agent || agent.workspaceId !== task.workspaceId)
      throw new Error("Session is unavailable or belongs to a different workspace.");
    if (agent.archivedAt) throw new Error("Restore the session before changing its settings.");
    if (input.modeId && !agent.availableModes?.some((m) => m.id === input.modeId))
      throw new Error("That permission mode is not available for this session.");
    if (input.modelId || input.feature) {
      if (input.modelId) {
        const catalog = await paseo.providers.listModels(agent.provider, { cwd: agent.cwd });
        if (catalog.error) throw new Error(catalog.error);
        if (!catalog.models?.some((m) => m.id === input.modelId && m.isSelectable !== false))
          throw new Error("That model is not available for this session.");
      } else {
        const feature = agent.features?.find((f) => f.id === input.feature!.id);
        const value = input.feature!.value;
        if (!feature || (feature.type === "toggle" ? typeof value !== "boolean" : typeof value !== "string" || !feature.options.some((o) => o.id === value)))
          throw new Error("That feature or value is not available for this session.");
      }
      const method = input.modelId ? "setAgentModel" : "setAgentFeature";
      let client: DaemonClient | undefined;
      try {
        client = await this.connect(paseoHome(), "flowly-session-settings", [method], "This Paseo version cannot change session models or provider features. Open the session in Paseo.");
        // Discovery/connection may take time: authorize again immediately before the write.
        const freshBoard = await this.store.read();
        const freshTask = freshBoard.tasks.find((t) => t.id === task.id);
        const fresh = (await paseo.agents.ref(agent.id).refresh())?.agent;
        if (!freshTask || freshTask.archivedAt || freshTask.workspaceId !== task.workspaceId ||
            !freshBoard.projects.some((p) => p.id === freshTask.projectId && !p.archivedAt) ||
            !fresh || fresh.archivedAt || fresh.workspaceId !== freshTask.workspaceId || fresh.provider !== agent.provider || fresh.cwd !== agent.cwd)
          throw new Error("The task or session changed. Refresh before trying again.");
        if (input.feature) {
          const feature = fresh.features?.find((f) => f.id === input.feature!.id);
          if (!feature || (feature.type === "toggle" ? typeof input.feature.value !== "boolean" : !feature.options.some((o) => o.id === input.feature!.value)))
            throw new Error("That feature or value is not available for this session.");
          await client.setAgentFeature(agent.id, input.feature.id, input.feature.value);
        } else {
          await client.setAgentModel(agent.id, input.modelId!);
        }
        return { applied: [input.modelId ? "model" : "feature"] };
      } catch (e) {
        logFailure("Flowly session configuration failed:", e, agent.id);
        throw e;
      } finally {
        await client?.close().catch((e) => logFailure("Flowly session configuration connection close failed:", e));
      }
    }
    const bin = await this.cli();
    const home = ["--home", paseoHome()];
    const applied: string[] = [];
    if (input.stop) {
      await this.run(bin, ["agent", "stop", agent.id, ...home]);
      applied.push("stopped");
    }
    if (input.title !== undefined) {
      // One `--name=` argument: a title starting with "-" is never read as an option.
      await this.run(bin, ["agent", "update", agent.id, `--name=${input.title}`, ...home]);
      applied.push("title");
    }
    if (input.thinkingOptionId) {
      await this.run(bin, ["agent", "update", agent.id, "--thinking", input.thinkingOptionId, ...home]);
      applied.push("reasoning");
    }
    if (input.modeId) {
      await this.run(bin, ["agent", "mode", agent.id, input.modeId, ...home]);
      applied.push("permissions");
    }
    return { applied };
  }
}
