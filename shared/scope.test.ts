import { expect, test } from "vitest";
import { sessionContext } from "./scope";
import { setupContextLine, setupMissing } from "./card-setup";
import type { Project, Task } from "./model";

const project = { id: "p", title: "P", primaryPath: "/r", repos: ["/r"] } as Project;
const task = { id: "t", title: "Fix login", description: "Steps", repoPaths: [] } as unknown as Task;

test.each([
  { name: "project root", card: { ...task, repoPaths: ["/r"] }, project, paths: [{ repo: "/r", directory: "/r" }], cwd: "/r" },
  { name: "worktree", card: { ...task, repoPaths: ["/r"] }, project, paths: [{ repo: "/r", directory: "/worktree" }], cwd: "/worktree" },
  { name: "linked root", card: task, project: { ...project, links: [{ name: "api", target: "/external/api" }] }, paths: [{ repo: "/r", directory: "/r" }], cwd: "/r" },
  { name: "legacy selected scope", card: { ...task, repoPaths: ["/other"] }, project: { ...project, repos: ["/r", "/other"] }, paths: [{ repo: "/other", directory: "/other" }], cwd: "/other" },
  { name: "legacy all repos", card: task, project: { ...project, repos: ["/r", "/other"] }, paths: [{ repo: "/r", directory: "/worktree" }, { repo: "/other", directory: "/other" }], cwd: "/worktree" },
])("$name keeps directory mappings and permits user-authorized external work", ({ card, project: p, paths, cwd }) => {
  const text = sessionContext(card, p as Project, paths, cwd);
  for (const path of paths) expect(text).toContain(`${path.repo} -> ${path.directory}`);
  expect(text).toContain(`Workspace starting directory: ${cwd}`);
  if (p.links) expect(text).toContain("api -> /external/api");
  if (p.repos.length > 1) expect(text).toContain("Legacy card scope retained");
  expect(text).toContain("default working locations, not a filesystem boundary");
  expect(text).toContain("When authorized by the user, you may operate on other directories, applications and external services");
  expect(text).toContain("Honor existing authorization in the conversation; ask before external operations only when authorization is missing");
  expect(text).toContain("A worktree isolates only the Git project root");
  expect(text).toContain("Provider permissions still apply; report denied access");
  expect(text).not.toContain("Work only in");
});

test("session context names the task type only when the card has one", () => {
  const paths = [{ repo: "/r", directory: "/r" }];
  expect(sessionContext(task, project, paths, "/r")).not.toContain("Task type:");
  expect(sessionContext({ ...task, type: "bugfix" }, project, paths, "/r")).toContain("Task ID: t\nTask type: Bug fix\nSteps");
});

test("session context lists the card's tags only when it has some", () => {
  const paths = [{ repo: "/r", directory: "/r" }];
  expect(sessionContext(task, project, paths, "/r")).not.toContain("Tags:");
  const tagged = { ...task, type: "bugfix", tags: [{ tag: "drawer", by: "human", at: "x" }, { tag: "perf", by: "agent", at: "x" }] } as Task;
  expect(sessionContext(tagged, project, paths, "/r")).toContain("Task type: Bug fix\nTags: drawer, perf\nSteps");
});

test("session context names missing card setup, and only what is missing (CARD-SETUP-SPEC §3.2)", () => {
  const paths = [{ repo: "/r", directory: "/r" }];
  const typed = { ...task, type: "bugfix" } as Task;
  const line = setupContextLine(setupMissing(typed, null, true));
  expect(line).toMatch(/^Card setup missing: tags, workpad\. /);
  expect(line).not.toContain("flowly_set_type");
  expect(sessionContext(typed, project, paths, "/r", [], [], line)).toContain(`Task type: Bug fix\n${line}\nSteps`);
  expect(setupContextLine([])).toBe("");
  expect(sessionContext(typed, project, paths, "/r", [], [], "")).not.toContain("Card setup missing");
});
