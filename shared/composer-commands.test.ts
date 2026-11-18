import { expect, test } from "vitest";
import { commandMatches, commandQuery, insertCommand, isHostCommand } from "./composer-commands";
import { outgoingFileSchema } from "./session-files";

test("completion follows only the leading slash token and preserves command arguments", () => {
  expect(commandQuery("/compact extra", 4)).toBe("com");
  expect(commandQuery("/compact extra", 12)).toBeNull();
  expect(commandQuery("a /compact", 10)).toBeNull();
  expect(commandQuery("/", 1)).toBe("");
  expect(insertCommand("/co extra", { name: "compact", kind: "command", description: "", argumentHint: "" })).toBe("/compact extra");
  expect(insertCommand("/sk", { name: "skill-name", kind: "skill", description: "", argumentHint: "" })).toBe("/skill-name ");
});
test("host aliases never become ordinary provider commands", () => {
  expect(commandMatches([{ name: "exit", aliases: ["quit"], description: "", argumentHint: "", hostOnly: true }], "quit")[0].name).toBe("exit");
  for (const text of ["/clear", " /new ", "/quit", "/q", "/exit"]) expect(isHostCommand(text)).toBe(true);
  expect(isHostCommand("/clear my file")).toBe(false);
  expect(isHostCommand("explain /exit")).toBe(false);
});
test("generic file payloads accept empty files but reject forged paths and corrupt base64", () => {
  expect(outgoingFileSchema.parse({ name: "empty.txt", mimeType: "text/plain", data: "" }).data).toBe("");
  for (const name of ["../secret", "C:\\secret", "/secret", "..", "."]) expect(outgoingFileSchema.safeParse({ name, mimeType: "text/plain", data: "AA==" }).success).toBe(false);
  for (const data of ["A", "abc", "abcd=", "data:application/pdf;base64,AA=="]) expect(outgoingFileSchema.safeParse({ name: "x", mimeType: "application/octet-stream", data }).success).toBe(false);
});
