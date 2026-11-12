import { afterEach, expect, test, vi } from "vitest";
import { posix, win32 } from "node:path";

// Synthetic canonical directories let every host exercise Windows drive/UNC
// boundaries as well as POSIX paths. Real Git/worktree matching is in repos.test.
vi.mock("node:fs/promises", () => ({
  realpath: async (path: string) => path,
}));
vi.mock("node:child_process", () => ({
  execFile: (
    _command: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error) => void,
  ) => callback(new Error("Not a Git repository")),
}));

afterEach(() => {
  vi.doUnmock("node:path");
  vi.resetModules();
});

test.each([
  { name: "Windows", api: win32, root: "C:\\project\\repo" },
  { name: "POSIX", api: posix, root: "/project/repo" },
])("$name directory boundaries", async ({ api, root }) => {
  vi.doMock("node:path", () => api);
  vi.resetModules();
  const { repoMatcher } = await import("./repos");
  const match = repoMatcher([root]);
  expect(await match(root)).toEqual([root]);
  expect(await match(api.join(root, "child", "nested"))).toEqual([root]);
  expect(await match(api.join(root, "..valid-child"))).toEqual([root]);
  expect(await match(api.dirname(root))).toEqual([]);
  expect(await match(api.join(root, "..", "sibling"))).toEqual([]);
  expect(await match(`${root}-other`)).toEqual([]);
});

test("Windows rejects another drive and unrelated UNC shares", async () => {
  vi.doMock("node:path", () => win32);
  vi.resetModules();
  const { repoMatcher } = await import("./repos");
  const match = repoMatcher(["C:\\project\\repo"]);
  expect(await match("D:\\project\\repo")).toEqual([]);
  expect(await match("\\\\server\\share\\repo")).toEqual([]);

  const uncRoot = "\\\\server\\share\\repo";
  const matchUnc = repoMatcher([uncRoot]);
  expect(await matchUnc(`${uncRoot}\\child`)).toEqual([uncRoot]);
  expect(await matchUnc("\\\\server\\share\\sibling")).toEqual([]);
  expect(await matchUnc("\\\\server\\other-share\\repo")).toEqual([]);
  expect(await matchUnc("\\\\other-server\\share\\repo")).toEqual([]);
});
