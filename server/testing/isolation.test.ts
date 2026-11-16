import { expect, inject, test } from "vitest";
import { access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { openLocalDaemon, LocalDaemonUnavailable } from "../local-daemon";
import { paseoHome } from "../service";

test("test home has no daemon discovery or credential and local transport refuses it", async () => {
  const { home, cli } = inject("paseoFixture");
  expect(paseoHome()).toBe(home);
  expect(home).not.toBe(join(homedir(), ".paseo"));
  expect(process.env.PASEO_CLI).toBe(cli);
  expect(process.env.PASEO_HOST).toBeUndefined();
  for (const name of ["paseo.pid", "local-credential"])
    await expect(access(join(home, name))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(openLocalDaemon(home, "flowly-unit-isolation", [], "")).rejects.toBeInstanceOf(LocalDaemonUnavailable);
  await expect(readFile(join(home, "projects", "projects.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("subprocesses inherit only the test home and disabled telemetry", async () => {
  const script = "console.log(JSON.stringify([process.env.PASEO_HOME,process.env.PASEO_HOST,process.env.NODE_ENV,process.env.FLOWLY_TELEMETRY]))";
  const { stdout } = await promisify(execFile)(process.execPath, ["-e", script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
  expect(JSON.parse(stdout)).toEqual([inject("paseoFixture").home, null, "test", "0"]);
});
