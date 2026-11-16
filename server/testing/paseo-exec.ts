import type { execFile } from "node:child_process";

const base = (path: string) => path.replaceAll("\\", "/").split("/").pop()!.toLowerCase();
const cliScript = (path: string) => /(?:^|\/)node_modules\/@getpaseo\/cli\/(?:bin\/paseo|dist\/index\.js)$/.test(path.replaceAll("\\", "/"));

/** Decode the supported CLI forms, never search arbitrary argv for "project". */
export function paseoArgs(file: string, args: string[]): string[] | null {
  const name = base(file);
  if (["paseo", "paseo.cmd", "paseo.bat"].includes(name)) return args;
  if (name === "paseo.exe" && args[0] === "--disable-warning=DEP0040" && base(args[1] ?? "") === "node-entrypoint-runner.js" && args[2] === "node-script" && cliScript(args[3] ?? ""))
    return args.slice(4);
  if (["node", "node.exe", "paseo.exe"].includes(name) && cliScript(args[0] ?? "")) return args.slice(1);
  return null;
}

/** Real Git is needed by repo matching; everything else must stay in the fake. */
export function mockPaseoExec(actual: typeof execFile, run: (args: string[]) => string) {
  return ((file: string, args: string[], options: unknown, callback: (error: unknown, result?: unknown) => void) => {
    const cb = typeof options === "function" ? options as typeof callback : callback;
    const command = paseoArgs(file, args);
    if (command) {
      if (command[0] !== "project" || !["create", "delete"].includes(command[1])) throw new Error("Unexpected Paseo operation in unit test");
      const homeIndex = command.indexOf("--home");
      if (homeIndex < 0 || !process.env.PASEO_HOME || command[homeIndex + 1] !== process.env.PASEO_HOME)
        throw new Error("Paseo test invocation must use the isolated home");
      let stdout: string;
      try { stdout = run(command); }
      catch (error) { cb(error); return; }
      cb(null, { stdout, stderr: "" });
      return;
    }
    if (["git", "git.exe"].includes(base(file))) return (actual as Function)(file, args, options, callback);
    throw new Error(`Unmocked subprocess in native project test: ${base(file)}`);
  }) as unknown as typeof execFile;
}
