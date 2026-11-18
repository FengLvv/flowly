import { realpath, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import type { BoardStore } from "./store";
import type { SessionTarget } from "../shared/session-target";
import { validSessionScope } from "../shared/session-target";
import { uploadedFileSchema, forgeReferenceSchema, type ForgeReference, type OutgoingFile, type UploadedFile } from "../shared/session-files";
import { nativeSession } from "./native-session";
import { openLocalDaemon } from "./local-daemon";
import { paseoHome } from "./service";
import { logFailure } from "./error-report";

/** Native upload storage, scoped to a freshly authorized existing conversation. */
export class SessionFiles {
  constructor(readonly board: BoardStore, readonly connect = openLocalDaemon, readonly home = paseoHome) {}
  async search(target: SessionTarget, query: string, paseo: PaseoApi): Promise<ForgeReference[]> {
    const before = await this.authorize(target, paseo);
    const client = await this.connect(paseoHome(), "flowly-session-forge", ["searchForge"], "This Paseo host cannot search issues or pull requests.");
    try {
      const current = await this.authorize(target, paseo);
      if (current.cwd !== before.cwd || current.workspaceId !== before.workspaceId) throw new Error("The session changed. Refresh before searching.");
      const result = await client.searchForge({ cwd: current.cwd, query, limit: 30 });
      if (result.error) throw new Error(result.error);
      await this.authorize(target, paseo);
      return result.items.flatMap(raw => {
        if (!raw || typeof raw !== "object") return [];
        const item = raw as Record<string, unknown>, pr = item.kind === "change_request";
        if (!pr && item.kind !== "issue") return [];
        const parsed = forgeReferenceSchema.safeParse({ type: pr ? "forge_change_request" : "forge_issue", mimeType: pr ? "application/paseo-forge-change-request" : "application/paseo-forge-issue", forge: typeof item.forge === "string" ? item.forge : "github", number: item.number, title: item.title, url: item.url, ...(typeof item.body === "string" ? { body: item.body } : {}), ...(pr && typeof item.baseRefName === "string" ? { baseRefName: item.baseRefName } : {}), ...(pr && typeof item.headRefName === "string" ? { headRefName: item.headRefName } : {}) });
        return parsed.success ? [parsed.data] : [];
      });
    } catch (error) { logFailure("Flowly session forge search failed:", error, target.agentId); throw error; } finally { await client.close().catch(error => logFailure("Flowly session forge connection close failed:", error)); }
  }
  async authorize(target: SessionTarget, paseo: PaseoApi) {
    if (!validSessionScope(target)) throw new Error("Give either a task or workspace target.");
    if (target.workspaceId) return nativeSession(paseo, target, true);
    const board = await this.board.read(), task = board.tasks.find(t => t.id === target.taskId);
    if (!task || task.archivedAt || !board.projects.some(p => p.id === task.projectId && !p.archivedAt)) throw new Error("Task is unavailable or archived.");
    const agent = (await paseo.agents.ref(target.agentId).refresh())?.agent;
    if (!agent || agent.workspaceId !== task.workspaceId || agent.archivedAt || agent.providerUnavailable) throw new Error("Session is unavailable or belongs to a different workspace.");
    const workspace = await paseo.workspaces.ref(task.workspaceId).refresh();
    if (!workspace || workspace.archivingAt) throw new Error("Workspace is unavailable.");
    return agent;
  }
  private async cleanupFailedBatch(home: string, file: UploadedFile) {
    if (!/^upload_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(file.id)) return;
    try {
      const root = await realpath(home), uploads = await realpath(join(root, "uploads"));
      const directory = join(uploads, file.id), actual = await realpath(directory), path = await realpath(file.path);
      const key = (value: string) => process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value);
      if (key(uploads) !== key(join(root, "uploads")) || key(actual) !== key(directory) || key(dirname(path)) !== key(directory)) throw new Error("Native upload ownership could not be verified.");
      await rm(actual, { recursive: true, force: true });
    } catch (error) { logFailure("Flowly failed upload cleanup failed:", error, file.id); }
  }
  async prepare(target: SessionTarget, files: readonly OutgoingFile[], paseo: PaseoApi): Promise<UploadedFile[]> {
    if (!files.length) return [];
    const before = await this.authorize(target, paseo);
    const home = this.home();
    const client = await this.connect(home, "flowly-session-files", ["uploadFile"], "This Paseo host cannot upload files.");
    const uploaded: UploadedFile[] = [];
    try {
      for (const file of files) {
        const current = await this.authorize(target, paseo);
        if (current.provider !== before.provider || current.cwd !== before.cwd || current.workspaceId !== before.workspaceId) throw new Error("The session changed. Refresh before uploading files.");
        const result = await client.uploadFile({ fileName: file.name, mimeType: file.mimeType, bytes: Buffer.from(file.data, "base64") });
        if (result.error || !result.file) throw new Error(result.error || "File upload failed.");
        uploaded.push(uploadedFileSchema.parse(result.file));
      }
      const after = await this.authorize(target, paseo);
      if (after.provider !== before.provider || after.cwd !== before.cwd || after.workspaceId !== before.workspaceId) throw new Error("The session changed. Refresh before sending files.");
      return uploaded;
    } catch (error) {
      // These successful uploads have never left this failed batch. A send has
      // not been attempted; deleting them cannot break an accepted message.
      await Promise.all(uploaded.map(file => this.cleanupFailedBatch(home, file)));
      logFailure("Flowly session file upload failed:", error, target.agentId);
      throw error;
    } finally {
      await client.close().catch(error => logFailure("Flowly session file upload connection close failed:", error));
    }
  }
}
