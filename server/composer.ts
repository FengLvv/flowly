import type { DraftAttachment, StoredDraftAttachment, HydratedAttachment } from "../shared/attachment-drafts";
import { logFailure } from "./error-report";
import { SessionFiles } from "./session-files";
import type { OutgoingFile, UploadedFile, ForgeReference } from "../shared/session-files";
import { nativeSession } from "./native-session";
import { validSessionScope, sessionScope, type SessionScope, type SessionTarget } from "../shared/session-target";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { BackgroundJobs } from "./background-jobs";
import type { PaseoApi } from "@getpaseo/client";
import type { BoardStore } from "./store";
import { composerStateSchema, type ComposerState, type OutgoingImage } from "../shared/composer";

type QueuedImage = { file: string; mimeType: OutgoingImage["mimeType"] };
const extension: Record<OutgoingImage["mimeType"], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const empty = (): ComposerState => ({ version: 1, sessions: {} });

/**
 * Unsent drafts and queued follow-ups per session, persisted on the daemon so a
 * plugin reload or app refresh keeps them. Serialized writes, atomic replace,
 * invalid files are preserved (never reset).
 */
export class ComposerStore {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly directory: string) {}
  get path() {
    return join(this.directory, "composer.json");
  }
  /** Queued messages' images live beside composer.json until sent or removed. */
  get imageDirectory() {
    return join(this.directory, "composer-images");
  }
  async writeImages(itemId: string, images: readonly OutgoingImage[]): Promise<QueuedImage[]> {
    if (!images.length) return [];
    await mkdir(this.imageDirectory, { recursive: true, mode: 0o700 });
    return Promise.all(
      images.map(async (image, index) => {
        const file = `${itemId}-${index}.${extension[image.mimeType]}`;
        await writeFile(join(this.imageDirectory, file), Buffer.from(image.data, "base64"), { mode: 0o600 });
        return { file, mimeType: image.mimeType };
      }),
    );
  }
  async readImages(images: readonly QueuedImage[] = []): Promise<OutgoingImage[]> {
    return Promise.all(
      images.map(async (image) => {
        try {
          return { data: (await readFile(join(this.imageDirectory, image.file))).toString("base64"), mimeType: image.mimeType };
        } catch {
          throw new Error("An image attached to this queued message is missing.");
        }
      }),
    );
  }
  async removeImages(images: readonly { file: string }[] = []) {
    await Promise.all(images.map((image) => rm(join(this.imageDirectory, image.file), { force: true })));
  }
  async writeFiles(files: readonly OutgoingFile[]) {
    if (!files.length) return [];
    await mkdir(this.imageDirectory, { recursive: true, mode: 0o700 });
    const saved: { file: string; name: string; mimeType: string }[] = [];
    try {
      for (const item of files) {
        const file = `${randomUUID()}.bin`;
        saved.push({ file, name: item.name, mimeType: item.mimeType });
        await writeFile(join(this.imageDirectory, file), Buffer.from(item.data, "base64"), { mode: 0o600 });
      }
      return saved;
    } catch (error) { await this.removeImages(saved); throw error; }
  }
  async readFiles(files: readonly { file: string; name: string; mimeType: string }[] = []): Promise<OutgoingFile[]> {
    return Promise.all(files.map(async item => ({ name: item.name, mimeType: item.mimeType, data: (await readFile(join(this.imageDirectory, item.file))).toString("base64") })));
  }
  private async load(): Promise<ComposerState> {
    try {
      return composerStateSchema.parse(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
      throw new Error(`Composer data is invalid; preserved at ${this.path}. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async read() {
    await this.tail;
    return this.load();
  }
  mutate<T>(operation: (state: ComposerState) => T, validate?: () => Promise<unknown>): Promise<T> {
    const job = this.tail.then(async () => {
      await validate?.();
      const state = await this.load();
      const value = operation(state);
      for (const [id, entry] of Object.entries(state.sessions))
        if (!entry.draft && !entry.queue.length && !entry.lastError && !entry.draftAttachments?.length && !entry.attachmentRevision) delete state.sessions[id];
      const next = composerStateSchema.parse(state);
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
      await rename(temporary, this.path);
      return value;
    });
    this.tail = job.then(() => undefined, () => undefined);
    return job;
  }
}

type Send = (paseo: PaseoApi, agentId: string, text: string, steer: boolean, images?: OutgoingImage[], messageId?: string, attachments?: (UploadedFile | ForgeReference)[]) => Promise<void>;
const defaultSend: Send = async (paseo, agentId, text, steer, images, messageId, attachments) => {
  // The queued item's ID becomes the message ID, so the sending client can match its images.
  await paseo.agents.ref(agentId).send(text, {
    ...(steer ? { activeTurnBehavior: "steer" as const } : {}),
    ...(images?.length ? { images } : {}),
    ...(attachments?.length ? { attachments } : {}),
    ...(messageId ? { messageId } : {}),
  });
};

export class ComposerService {
  private draining = new Set<string>();
  private jobs = new BackgroundJobs();
  /** Resolves once no background drain check is left. */
  idle() {
    return this.jobs.idle();
  }
  private lastDrain = new Map<string, number>();
  constructor(
    readonly store: ComposerStore,
    readonly board: BoardStore,
    readonly send: Send = defaultSend,
    readonly clock = () => Date.now(),
    readonly files: Pick<SessionFiles, "prepare"> = new SessionFiles(board),
  ) {}

  private entry(state: ComposerState, agentId: string, target: string | SessionScope) {
    const entry = state.sessions[agentId] ??= { ...sessionScope(target), draft: "", draftAt: null, queue: [], lastError: null };
    if (!entry.queue.length) {
      entry.taskId = sessionScope(target).taskId;
      entry.workspaceId = sessionScope(target).workspaceId;
    }
    return entry;
  }

  /** The session must exist, belong to the card's workspace, and the card must be live. */
  private async verify(target: SessionTarget, paseo: PaseoApi, writable = false) {
    if (!validSessionScope(target)) throw new Error("Give either a task or workspace target.");
    if (target.workspaceId) return nativeSession(paseo, target, writable);
    const { taskId, agentId } = target;
    const board = await this.board.read();
    const task = board.tasks.find((t) => t.id === taskId);
    const project = task && board.projects.find((p) => p.id === task.projectId);
    if (!task || !project || task.archivedAt || project.archivedAt)
      throw new Error("Task is unavailable or archived.");
    const agent = (await paseo.agents.ref(agentId).refresh())?.agent;
    if (!agent || agent.workspaceId !== task.workspaceId)
      throw new Error("Session is unavailable or belongs to a different workspace.");
    if (writable && (agent.archivedAt || agent.providerUnavailable)) throw new Error("Session is archived or its provider is unavailable.");
    return agent;
  }

  read() {
    return this.store.read();
  }

  async readAttachments(input: SessionTarget, paseo: PaseoApi) {
    await this.verify(input, paseo);
    const entry = (await this.store.read()).sessions[input.agentId];
    const items: HydratedAttachment[] = [];
    for (const item of entry?.draftAttachments || []) {
      if (item.kind === "reference") { items.push(item); continue; }
      let data: string | null = null;
      try { data = (await this.store.readFiles([item]))[0].data; } catch { /* Missing bytes stay visible/removable, never silently discarded. */ }
      items.push({ id: item.id, kind: item.kind, name: item.name, mimeType: item.mimeType, data });
    }
    await this.verify(input, paseo);
    return { items, revision: entry?.attachmentRevision || 0 };
  }
  async addAttachments(input: SessionTarget & { items: DraftAttachment[] }, paseo: PaseoApi) {
    await this.verify(input, paseo, true);
    const prepared: StoredDraftAttachment[] = [];
    let committed = false;
    try {
      for (const item of input.items.filter((item, index) => input.items.findIndex(other => other.id === item.id) === index)) {
        if (item.kind === "reference") prepared.push(item);
        else { const [file] = await this.store.writeFiles([item]); prepared.push({ ...file, id: item.id, kind: item.kind }); }
      }
      const result = await this.store.mutate(state => {
        const entry = this.entry(state, input.agentId, input), before = entry.draftAttachments || [];
        const added = prepared.filter((item, index) => !before.some(old => old.id === item.id) && prepared.findIndex(other => other.id === item.id) === index);
        entry.draftAttachments = [...before, ...added];
        if (added.length) entry.attachmentRevision = (entry.attachmentRevision || 0) + 1;
        return { revision: entry.attachmentRevision || 0, used: added.filter(item => item.kind !== "reference").map(item => item.file) };
      }, () => this.verify(input, paseo, true));
      committed = true;
      const unused = prepared.filter(item => item.kind !== "reference" && !result.used.includes(item.file)) as Exclude<StoredDraftAttachment, { kind: "reference" }>[];
      await this.store.removeImages(unused).catch(error => logFailure("Flowly attachment draft cleanup failed:", error));
      return { revision: result.revision };
    } catch (error) {
      if (!committed) await this.store.removeImages(prepared.filter(item => item.kind !== "reference") as Exclude<StoredDraftAttachment, { kind: "reference" }>[]).catch(cleanup => logFailure("Flowly attachment draft cleanup failed:", cleanup));
      throw error;
    }
  }
  async removeAttachments(input: SessionTarget & { ids: string[] }, paseo: PaseoApi) {
    const result = await this.store.mutate(state => {
      const entry = state.sessions[input.agentId];
      if (!entry) return { revision: 0, files: [] as { file: string }[] };
      const old = entry.draftAttachments || [], removed = old.filter(item => input.ids.includes(item.id));
      entry.draftAttachments = old.filter(item => !input.ids.includes(item.id));
      if (removed.length) entry.attachmentRevision = (entry.attachmentRevision || 0) + 1;
      return { revision: entry.attachmentRevision || 0, files: removed.filter(item => item.kind !== "reference") as { file: string }[] };
    }, () => this.verify(input, paseo, true));
    await this.store.removeImages(result.files).catch(error => logFailure("Flowly attachment draft cleanup failed:", error));
    return { revision: result.revision };
  }

  async saveDraft(input: SessionTarget & { text: string }, paseo?: PaseoApi) {
    if (!validSessionScope(input)) throw new Error("Give either a task or workspace target.");
    if (input.workspaceId) {
      if (!paseo) throw new Error("Workspace authorization is unavailable.");
      await nativeSession(paseo, input);
    }
    return this.store.mutate((state) => {
      const entry = this.entry(state, input.agentId, input);
      entry.draft = input.text;
      entry.draftAt = new Date(this.clock()).toISOString();
      return { ok: true };
    });
  }

  async push(input: SessionTarget & { text: string; images?: OutgoingImage[]; files?: OutgoingFile[]; references?: ForgeReference[] }, paseo: PaseoApi) {
    await this.verify(input, paseo);
    const id = randomUUID();
    const images = await this.store.writeImages(id, input.images || []);
    let files;
    try { files = await this.store.writeFiles(input.files || []); } catch (error) { await this.store.removeImages(images); throw error; }
    const item = { id, text: input.text, ...(input.references?.length ? { references: input.references } : {}), ...(files.length ? { files } : {}), at: new Date(this.clock()).toISOString(), ...(images.length ? { images } : {}) };
    try {
      await this.store.mutate((state) => {
        const entry = this.entry(state, input.agentId, input);
        if (entry.queue.length >= 50) throw new Error("Queue is full (50 messages).");
        entry.queue.push(item);
        entry.lastError = null;
      });
    } catch (error) {
      await this.store.removeImages([...images, ...files]);
      throw error;
    }
    // The turn may already have ended between the client's check and now.
    this.jobs.track(this.drain(input.agentId, paseo));
    return item;
  }

  async remove(input: { agentId: string; id: string }) {
    const removed = await this.store.mutate((state) => {
      const entry = state.sessions[input.agentId];
      const found = entry?.queue.find((m) => m.id === input.id);
      if (entry) entry.queue = entry.queue.filter((m) => m.id !== input.id);
      return found;
    });
    await this.store.removeImages([...(removed?.images || []), ...(removed?.files || [])]);
    return { ok: true };
  }

  /** "Send now": steer the running turn with a queued message (Paseo parity). */
  async sendNow(input: SessionTarget & { id: string }, paseo: PaseoApi) {
    const agent = await this.verify(input, paseo);
    const saved = (await this.store.read()).sessions[input.agentId];
    if (saved) await this.verify({ taskId: saved.taskId, workspaceId: saved.workspaceId, agentId: input.agentId }, paseo);
    const item = await this.store.mutate((state) => {
      const entry = state.sessions[input.agentId];
      const found = entry?.queue.find((m) => m.id === input.id);
      if (!entry || !found) throw new Error("That queued message was already sent or removed.");
      entry.queue = entry.queue.filter((m) => m.id !== input.id);
      return found;
    });
    const running = agent.status === "running" || agent.status === "initializing";
    try {
      const uploaded = await this.files.prepare(input, await this.store.readFiles(item.files), paseo);
      await this.verify(input, paseo);
      await this.send(paseo, input.agentId, item.text, running, await this.store.readImages(item.images), item.id, [...uploaded, ...(item.references || [])]);
      await this.store.removeImages([...(item.images || []), ...(item.files || [])]);
    } catch (error) {
      await this.store.mutate((state) => {
        const entry = this.entry(state, input.agentId, input);
        entry.queue.unshift(item);
      });
      throw error;
    }
    return { sent: true };
  }

  /**
   * Sends the oldest queued message once the session is idle. Called on
   * turn end, after a push, and opportunistically on reads; one message per
   * turn (a short cooldown prevents a stale "idle" snapshot double-sending).
   */
  async drain(agentId: string, paseo: PaseoApi) {
    if (this.draining.has(agentId)) return false;
    if (this.clock() - (this.lastDrain.get(agentId) || 0) < 8000) return false;
    this.draining.add(agentId);
    try {
      const state = await this.store.read();
      const entry = state.sessions[agentId];
      if (!entry?.queue.length) return false;
      const agent = (await paseo.agents.ref(agentId).refresh())?.agent;
      if (!agent || agent.status === "running" || agent.status === "initializing") return false;
      if (agent.pendingPermissions?.length) return false;
      try { await this.verify({ taskId: entry.taskId, workspaceId: entry.workspaceId, agentId }, paseo); }
      catch { return false; }
      const item = await this.store.mutate((s) => {
        const e = s.sessions[agentId];
        return e?.queue.shift() ?? null;
      });
      if (!item) return false;
      this.lastDrain.set(agentId, this.clock());
      try {
        const uploaded = await this.files.prepare({ ...entry, agentId }, await this.store.readFiles(item.files), paseo);
        await this.verify({ ...entry, agentId }, paseo);
        await this.send(paseo, agentId, item.text, false, await this.store.readImages(item.images), item.id, [...uploaded, ...(item.references || [])]);
        await this.store.removeImages([...(item.images || []), ...(item.files || [])]);
        await this.store.mutate((s) => {
          const e = s.sessions[agentId];
          if (e) e.lastError = null;
        });
        return true;
      } catch (error) {
        await this.store.mutate((s) => {
          const e = this.entry(s, agentId, entry);
          e.queue.unshift(item);
          e.lastError = error instanceof Error ? error.message : String(error);
        });
        return false;
      }
    } finally {
      this.draining.delete(agentId);
    }
  }

  async drainAll(paseo: PaseoApi) {
    // Drafts/queues of wrapped-up (archived) or deleted cards are dropped.
    const board = await this.board.read();
    const live = new Set(board.tasks.filter((t) => !t.archivedAt).map((t) => t.id));
    const before = await this.store.read();
    if (Object.values(before.sessions).some((e) => !!e.taskId && !live.has(e.taskId))) {
      const dropped = await this.store.mutate((s) => {
        const images: { file: string }[] = [];
        for (const [id, e] of Object.entries(s.sessions))
          if (!!e.taskId && !live.has(e.taskId)) {
            for (const m of e.queue) images.push(...(m.images || []), ...(m.files || []));
            for (const item of e.draftAttachments || []) if (item.kind !== "reference") images.push(item);
            delete s.sessions[id];
          }
        return images;
      });
      await this.store.removeImages(dropped);
    }
    const state = await this.store.read();
    for (const [agentId, entry] of Object.entries(state.sessions))
      if (entry.queue.length) this.jobs.track(this.drain(agentId, paseo));
  }
}
