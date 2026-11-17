import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import { BoardStore } from "./store";
import { SessionFiles } from "./session-files";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "flowly-files-")); roots.push(root);
  const board = new BoardStore(root), now = new Date().toISOString();
  await board.mutate(b => {
    b.projects.push({ id: "p", paseoProjectId: "np", title: "P", description: "", primaryPath: root, repos: [root], revision: 1, createdAt: now, updatedAt: now, archivedAt: null });
    b.tasks.push({ id: "t", projectId: "p", workspaceId: "w", sourcePath: root, repoPaths: [root], title: "T", description: "", status: "todo", priority: "normal", position: 0, revision: 1, operationId: "o", createdAt: now, updatedAt: now, archivedAt: null });
  });
  const agent = { id: "a", workspaceId: "w", provider: "codex", cwd: root, archivedAt: null };
  const paseo = { agents: { ref: () => ({ refresh: async () => ({ agent }) }) }, workspaces: { ref: () => ({ refresh: async () => ({ id: "w" }) }) } } as unknown as PaseoApi;
  const close = vi.fn(async () => {}), upload = vi.fn(async (input: any) => ({ error: null, file: { type: "uploaded_file", id: "f", fileName: input.fileName, mimeType: input.mimeType, size: input.bytes.length, path: join(root, "native-upload") } }));
  const connect = vi.fn(async () => ({ uploadFile: upload, close }));
  const service = new SessionFiles(board, connect as never);
  return { board, agent, paseo, close, upload, connect, service };
}
test("files upload through native storage with unchanged bytes and a closed short connection", async () => {
  const x = await setup(), bytes = Buffer.from([0, 255, 1]);
  const files = await x.service.prepare({ taskId: "t", agentId: "a" }, [{ name: "data.bin", mimeType: "application/octet-stream", data: bytes.toString("base64") }], x.paseo);
  expect(x.upload.mock.calls[0][0].bytes).toEqual(bytes); expect(files[0].fileName).toBe("data.bin"); expect(x.close).toHaveBeenCalledOnce();
});
test("wrong scope is refused before connection and a scope change during connect prevents upload", async () => {
  const x = await setup(), input = [{ name: "x", mimeType: "text/plain", data: "" }];
  x.agent.workspaceId = "other";
  await expect(x.service.prepare({ taskId: "t", agentId: "a" }, input, x.paseo)).rejects.toThrow("different workspace"); expect(x.connect).not.toHaveBeenCalled();
  x.agent.workspaceId = "w";
  x.connect.mockImplementationOnce(async () => { x.agent.workspaceId = "other"; return { uploadFile: x.upload, close: x.close }; });
  await expect(x.service.prepare({ taskId: "t", agentId: "a" }, input, x.paseo)).rejects.toThrow("different workspace"); expect(x.upload).not.toHaveBeenCalled(); expect(x.close).toHaveBeenCalledOnce();
});
test("native errors still close the connection and can be retried", async () => {
  const x = await setup(), input = [{ name: "x", mimeType: "text/plain", data: "eA==" }];
  x.upload.mockRejectedValueOnce(new Error("provider offline"));
  await expect(x.service.prepare({ taskId: "t", agentId: "a" }, input, x.paseo)).rejects.toThrow("provider offline");
  expect(x.close).toHaveBeenCalledOnce(); await expect(x.service.prepare({ taskId: "t", agentId: "a" }, input, x.paseo)).resolves.toHaveLength(1);
});


test("a failed batch removes only its own completed native uploads, never sibling uploads", async () => {
  const x = await setup(), root = x.board.directory;
  const id = "upload_11111111-1111-4111-8111-111111111111", sibling = "upload_22222222-2222-4222-8222-222222222222";
  const own = join(root, "uploads", id), other = join(root, "uploads", sibling);
  await mkdir(own, { recursive: true }); await mkdir(other, { recursive: true });
  await writeFile(join(own, "x.txt"), "x"); await writeFile(join(other, "keep.txt"), "keep");
  x.upload.mockResolvedValueOnce({ error: null, file: { type: "uploaded_file", id, fileName: "x.txt", mimeType: "text/plain", size: 1, path: join(own, "x.txt") } });
  x.upload.mockRejectedValueOnce(new Error("second upload failed"));
  const service = new SessionFiles(x.board, x.connect as never, () => root);
  await expect(service.prepare({ taskId: "t", agentId: "a" }, [{ name: "x.txt", mimeType: "text/plain", data: "eA==" }, { name: "y.txt", mimeType: "text/plain", data: "eQ==" }], x.paseo)).rejects.toThrow("second upload failed");
  await expect(stat(own)).rejects.toThrow(); expect((await stat(join(other, "keep.txt"))).isFile()).toBe(true); expect(x.close).toHaveBeenCalledOnce();
});
