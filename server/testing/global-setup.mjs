import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export default async function setup(project) {
  const home = await mkdtemp(join(tmpdir(), "flowly-vitest-"));
  try {
    // Resolution is deterministic; these files must never execute. The native
    // project tests intercept execFile and reject any unrecognised invocation.
    const resources = join(home, "app", "resources");
    const cli = join(resources, "bin", process.platform === "win32" ? "paseo.cmd" : "paseo");
    for (const file of [cli, join(home, "app", "Paseo.exe"), join(resources, "app.asar.unpacked", "dist", "daemon", "node-entrypoint-runner.js")]) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, "", { mode: 0o700 });
    }
    project.provide("paseoFixture", { home, cli });
    return () => rm(home, { recursive: true, force: true });
  } catch (error) {
    await rm(home, { recursive: true, force: true });
    throw error;
  }
}
