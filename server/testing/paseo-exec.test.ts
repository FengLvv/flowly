import { expect, test, vi } from "vitest";
import type { execFile } from "node:child_process";
import { paseoInvocation } from "../paseo-cli";
import { mockPaseoExec } from "./paseo-exec";

const desktop = "C:\\Paseo\\resources\\bin\\paseo.cmd";
const npm = "C:\\npm\\paseo.cmd";
const forms = [
  { file: "paseo", prefix: [] },
  { file: "/Applications/Paseo.app/Contents/Resources/bin/paseo", prefix: [] },
  { file: "C:\\tools\\paseo.cmd", prefix: [] },
  { file: "C:\\tools\\PASEO.BAT", prefix: [] },
  { file: "C:\\Paseo\\Paseo.exe", prefix: ["--disable-warning=DEP0040", "C:\\Paseo\\resources\\app.asar.unpacked\\dist\\daemon\\node-entrypoint-runner.js", "node-script", "C:\\Paseo\\resources\\app.asar\\node_modules\\@getpaseo\\cli\\dist\\index.js"] },
  { file: "C:\\node\\node.exe", prefix: ["C:\\npm\\node_modules\\@getpaseo\\cli\\bin\\paseo"] },
];

function invoke(file: string, args: string[]) {
  const real = vi.fn(), run = vi.fn(() => "fixture stdout"), callback = vi.fn();
  const exec = mockPaseoExec(real as unknown as typeof execFile, run);
  (exec as Function)(file, args, {}, callback);
  expect(real).not.toHaveBeenCalled();
  expect(callback).toHaveBeenCalledWith(null, { stdout: "fixture stdout", stderr: "" });
  return run;
}

test.each(forms)("intercepts create and delete via $file ($prefix)", ({ file, prefix }) => {
  for (const operation of ["create", "delete"]) {
    const args = ["project", operation, "fixture & %PATH%", "--home", process.env.PASEO_HOME!, "--json"];
    expect(invoke(file, [...prefix, ...args])).toHaveBeenCalledWith(args);
  }
});

test.each(["desktop", "npm"])("intercepts the actual paseoInvocation %s conversion on every OS", async (layout) => {
  const args = ["project", "create", "fixture", "--home", process.env.PASEO_HOME!];
  const run = await paseoInvocation(layout === "desktop" ? desktop : npm, args, "win32", process.env, "C:\\node\\node.exe",
    async path => layout === "desktop" || path === "C:\\npm\\node_modules\\@getpaseo\\cli\\bin\\paseo");
  expect(run.env?.PASEO_HOME).toBe(process.env.PASEO_HOME);
  expect(invoke(run.file, run.args)).toHaveBeenCalledWith(args);
});

test("unknown executables, runner layouts, commands and homes cannot fall through", () => {
  const real = vi.fn(), run = vi.fn(), callback = vi.fn();
  const exec = mockPaseoExec(real as unknown as typeof execFile, run);
  for (const [file, args] of [
    ["cmd.exe", ["/c", "paseo", "project", "create"]],
    ["C:\\Paseo\\Paseo.exe", ["--unknown-layout", "project", "create"]],
    ["node.exe", ["unrelated.js", "project", "delete"]],
    ["paseo", ["agent", "stop", "user-agent"]],
    ["paseo", ["project", "delete", "fixture", "--home", "daily-home"]],
    ["paseo", ["project", "create", "fixture"]],
  ] as [string, string[]][])
    expect(() => (exec as Function)(file, args, {}, callback)).toThrow();
  expect(real).not.toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
});

test("Git alone can use the actual subprocess for repository checks", () => {
  const real = vi.fn(), run = vi.fn(), callback = vi.fn();
  const exec = mockPaseoExec(real as unknown as typeof execFile, run);
  (exec as Function)("git", ["status"], {}, callback);
  expect(real).toHaveBeenCalledWith("git", ["status"], {}, callback);
  expect(run).not.toHaveBeenCalled();
});
