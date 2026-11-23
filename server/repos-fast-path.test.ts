import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const calls = vi.hoisted(() => ({ git: vi.fn((_file, _args, _options, done) => done(new Error("Git is unavailable"))) }));
vi.mock("node:child_process", () => ({ execFile: calls.git }));
import { repoMatcher } from "./repos";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  calls.git.mockClear();
});

test("canonical contained directories match every legacy root without invoking Git", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "flowly-scope-fast-")));
  roots.push(root);
  const nested = join(root, "nested"), child = join(nested, "child");
  await mkdir(child, { recursive: true });
  expect(await repoMatcher([root])(root)).toEqual([root]);
  expect(await repoMatcher([root, nested])(child)).toEqual([nested, root]);
  expect(calls.git).not.toHaveBeenCalled();
});

test("sibling prefixes and symlink escapes still need Git proof and reject when it is unavailable", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "flowly-scope-fast-")));
  roots.push(root);
  const repo = join(root, "repo"), outside = join(root, "repo-other");
  await mkdir(repo); await mkdir(outside);
  const escape = join(repo, "escape");
  await symlink(outside, escape, process.platform === "win32" ? "junction" : "dir");
  expect(await repoMatcher([repo])(outside)).toEqual([]);
  expect(await repoMatcher([repo])(escape)).toEqual([]);
  expect(calls.git).toHaveBeenCalledTimes(2);
});
