import { syncDirectory } from "./board-file";
import { mkdir, readFile, unlink, lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { descriptionImageInputsSchema, type DescriptionImageInput, type DescriptionImage } from "../shared/description-images";
import type { OutgoingImage } from "../shared/composer";
import type { BoardStore } from "./store";
import { logFailure } from "./error-report";

const extension = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as const;
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function writeImage(path: string, bytes: Buffer) {
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  catch (error) { await handle.close(); await unlink(path); throw error; }
  finally { await handle.close(); }
}
function decode(image: OutgoingImage) {
  const bytes = Buffer.from(image.data, "base64");
  if (!bytes.length || bytes.toString("base64") !== image.data)
    throw new Error("Invalid image data (expected nonempty canonical base64).");
  const valid = image.mimeType === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : image.mimeType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : image.mimeType === "image/gif" ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("ascii"))
    : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!valid) throw new Error("Image content does not match its PNG, JPEG, GIF or WebP type.");
  return bytes;
}

/** Immutable backup assets; only current card membership grants live read access. */
export class DescriptionImageFiles {
  readonly directory: string;
  constructor(dataDirectory: string) { this.directory = join(dataDirectory, "description-images"); }
  private async ensureDirectory() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (!(await lstat(this.directory)).isDirectory()) throw new Error("Image storage must be a directory, not a symlink.");
  }
  private path(image: DescriptionImage) { return join(this.directory, `${image.id}.${extension[image.mimeType]}`); }
  validate(inputs: readonly DescriptionImageInput[], existing: readonly DescriptionImage[] = []) {
    const parsed = descriptionImageInputsSchema.parse(inputs);
    const seen = new Set<string>();
    for (const input of parsed) {
      if ("id" in input) {
        if (seen.has(input.id) || !existing.some((x) => x.id === input.id)) throw new Error("Image does not belong to this card or is repeated.");
        seen.add(input.id);
      } else decode(input);
    }
  }
  async save(inputs: readonly DescriptionImageInput[], existing: readonly DescriptionImage[], added: DescriptionImage[]) {
    this.validate(inputs, existing);
    const result: DescriptionImage[] = [];
    for (const input of inputs) {
      if ("id" in input) {
        const image = existing.find((x) => x.id === input.id)!;
        await this.read(image);
        result.push(image);
      } else {
        const bytes = decode(input);
        const image: DescriptionImage = { id: randomUUID(), name: input.name, mimeType: input.mimeType, bytes: bytes.length, sha256: hash(bytes) };
        await this.ensureDirectory();
        added.push(image); // include partially written files in failure cleanup
        await writeImage(this.path(image), bytes);
        await syncDirectory(this.directory);
        result.push(image);
      }
    }
    return result;
  }
  async read(image: DescriptionImage): Promise<OutgoingImage> {
    if (!(await lstat(this.directory).catch(() => null))?.isDirectory()) throw new Error("Description image storage is unavailable.");
    const path = this.path(image);
    const info = await lstat(path).catch(() => null);
    if (!info?.isFile() || info.size !== image.bytes)
      throw new Error("A description image is missing or invalid. Reload or replace it before continuing.");
    const bytes = await readFile(path);
    if (hash(bytes) !== image.sha256) throw new Error("A description image is corrupt. Replace it before continuing.");
    const outgoing = { data: bytes.toString("base64"), mimeType: image.mimeType };
    decode(outgoing);
    return outgoing;
  }
  /** Historical backups retain old files. Clean only this failed attempt's unused files. */
  async cleanup(store: BoardStore, added: readonly DescriptionImage[]) {
    try {
      const board = await store.read();
      const live = new Set(board.tasks.flatMap((t) => t.descriptionImages || []).map((i) => i.id));
      for (const image of added) if (!live.has(image.id)) await unlink(this.path(image)).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw e; });
    } catch (error) { logFailure("Description image cleanup failed:", error); }
  }
  /** Copy bytes before publishing/restoring snapshot references. IDs never overwrite different bytes. */
  async copyTo(destination: DescriptionImageFiles, images: readonly DescriptionImage[]) {
    for (const image of images) {
      const { data } = await this.read(image);
      await destination.ensureDirectory();
      try { await writeImage(destination.path(image), Buffer.from(data, "base64")); await syncDirectory(destination.directory); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await destination.read(image);
      }
    }
  }
}

export class DescriptionImages {
  constructor(readonly store: BoardStore) {}
  async read(input: { taskId: string; revision: number; imageId?: string }) {
    const task = (await this.store.read()).tasks.find((t) => t.id === input.taskId);
    if (!task) throw new Error("Task not found.");
    if (task.revision !== input.revision) throw new Error("Card changed. Use card description again to reload it.");
    const images = input.imageId ? (task.descriptionImages || []).filter((i) => i.id === input.imageId) : task.descriptionImages || [];
    if (input.imageId && !images.length) throw new Error("Image does not belong to this card.");
    const files = new DescriptionImageFiles(this.store.directory);
    const payload = await Promise.all(images.map(async (image) => ({ ...image, ...await files.read(image) })));
    const latest = (await this.store.read()).tasks.find((t) => t.id === task.id);
    if (latest?.revision !== task.revision) throw new Error("Card changed. Use card description again to reload it.");
    return { revision: task.revision, description: task.description, images: payload };
  }
}
