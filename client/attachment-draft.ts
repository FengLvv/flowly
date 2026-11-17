import type { DraftAttachment, HydratedAttachment } from "../shared/attachment-drafts";

type Reply = { revision: number };
export type AttachmentDraftIO = {
  read(): Promise<Reply & { items: HydratedAttachment[] }>;
  add(items: DraftAttachment[]): Promise<Reply>;
  remove(ids: string[]): Promise<Reply>;
};
type Job = { add: DraftAttachment[] } | { remove: string[] };
export type AttachmentDraftState = { items: HydratedAttachment[]; loading: boolean; saving: boolean; error: string; revision: number };
const merge = (items: HydratedAttachment[], added: HydratedAttachment[]) => [...items, ...added.filter(item => !items.some(old => old.id === item.id))];

/** Per-session owner, independent of a mounted preview. Pending writes retain their bytes and ordering. */
export class AttachmentDraft {
  private state: AttachmentDraftState = { items: [], loading: true, saving: false, error: "", revision: 0 };
  private listeners = new Set<() => void>();
  private jobs: Job[] = [];
  private submitted = new Set<string>();
  private loaded = false;
  private reading?: Promise<void>;
  private writing?: Promise<void>;
  constructor(public io: AttachmentDraftIO) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<AttachmentDraftState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  idle() { return !this.jobs.length && !this.writing && !this.reading && !this.submitted.size; }
  ready() { return this.loaded && !this.state.loading && !this.state.saving && !this.state.items.some(item => item.kind !== "reference" && item.data === null); }
  async load(force = false) {
    if (this.reading) return this.reading;
    if (this.loaded && !force) return;
    this.update({ loading: true });
    this.reading = (async () => {
      try {
        const result = await this.io.read();
        if (result.revision >= this.state.revision) {
          let items = result.items;
          for (const job of this.jobs) items = "add" in job ? merge(items, job.add) : items.filter(item => !job.remove.includes(item.id));
          this.update({ items: items.filter(item => !this.submitted.has(item.id)), revision: result.revision });
        }
        this.loaded = true;
        if (!this.jobs.length) this.update({ error: "" });
      } catch (error) { this.update({ error: error instanceof Error ? error.message : String(error) }); }
      finally { this.reading = undefined; this.update({ loading: false }); }
    })();
    return this.reading;
  }
  add(items: DraftAttachment[]) {
    const unique = items.filter((item, index) => items.findIndex(other => other.id === item.id) === index);
    if (!unique.length) return;
    this.update({ items: merge(this.state.items, unique) });
    this.enqueue({ add: unique });
  }
  remove(ids: string[]) {
    if (!ids.length) return;
    this.update({ items: this.state.items.filter(item => !ids.includes(item.id)) });
    this.enqueue({ remove: ids });
  }
  /** Hide while sending, but keep the daemon draft until a positive acknowledgement. */
  detach() {
    if (!this.ready()) return undefined;
    const items = this.state.items as DraftAttachment[];
    items.forEach(item => this.submitted.add(item.id));
    this.update({ items: [] });
    return items;
  }
  acknowledge(items: DraftAttachment[]) {
    this.enqueue({ remove: items.map(item => item.id) });
    items.forEach(item => this.submitted.delete(item.id));
  }
  restore(items: DraftAttachment[]) {
    items.forEach(item => this.submitted.delete(item.id));
    this.add(items);
  }
  private enqueue(job: Job) { this.jobs.push(job); this.update({ saving: true }); void this.flush(); }
  private async flush() {
    if (this.writing) return this.writing;
    this.writing = (async () => {
      while (this.jobs.length) {
        const job = this.jobs[0];
        try {
          const result = "add" in job ? await this.io.add(job.add) : await this.io.remove(job.remove);
          this.jobs.shift();
          this.update({ revision: Math.max(this.state.revision, result.revision), error: "" });
        } catch (error) { this.update({ error: error instanceof Error ? error.message : String(error) }); break; }
      }
    })();
    await this.writing;
    this.writing = undefined;
    this.update({ saving: this.jobs.length > 0 });
  }
  async retry() { await this.flush(); if (!this.jobs.length) await this.load(true); }
}
