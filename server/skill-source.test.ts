import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { skillText, workingInstructions } from "./skill-source";
import { sessionContext } from "../shared/scope";
import type { Project, Task } from "../shared/model";
import { turnChecklist } from "../shared/turn-checklist";

test("the installed skill source contains the exact live checklist before details", async () => {
  const core = skillText.split("## Start of every turn\n")[1]!.split("## Details")[0]!;
  for (const [index, rule] of turnChecklist.entries())
    expect(core).toContain(`${index + 1}. ${rule}`);
  expect(turnChecklist).toHaveLength(6);
  expect(turnChecklist.join("\n").length).toBeLessThan(1800);
  expect(skillText).not.toContain("before starting a work phase");
  expect(skillText).not.toMatch(/Start of every turn, step \d/);
  expect((await readFile(new URL("../skills/flowly/SKILL.md", import.meta.url), "utf8")).replace(/\r\n/g, "\n")).toBe(skillText);
});

test("new and explicit existing-session instructions permit authorized external operations", () => {
  const context = sessionContext(
    { id: "t", title: "Authorized external work", description: "Update a user tool", repoPaths: ["/r"] } as Task,
    { id: "p", title: "Project", primaryPath: "/r", repos: ["/r"] } as Project,
    [{ repo: "/r", directory: "/r" }], "/r",
  );
  const instructions = workingInstructions(context, "/data/flowly.mjs", "/data/sessions/s.json", "/data/SKILL.md");
  expect(instructions).toContain(context);
  expect(instructions).toContain(skillText);
  expect(skillText).toContain("Use scope.repoPaths and scope.directories as default working locations, not a filesystem boundary");
  expect(skillText).toContain("When authorized by the user, you may operate on other directories, applications and external services");
  expect(skillText).toContain("Honor existing authorization in the conversation; ask before external operations only when authorization is missing");
  expect(skillText).toContain("Flowly card/workspace bindings and tool authorization checks remain unchanged");
  expect(skillText).toContain("Provider permissions still apply. Report denied access");
  expect(instructions).not.toMatch(/Work only in|follow the listed directories|Follow scope\.repoPaths/);
});
