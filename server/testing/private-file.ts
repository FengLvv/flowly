import { stat } from "node:fs/promises";
import { expect } from "vitest";

/** Verify restrictive creation on every host; Windows stat modes are not ACLs. */
export async function expectPrivateFile(path: string, writes: readonly (readonly unknown[])[]) {
  const requests = writes.filter(([file]) => typeof file === "string" && file.startsWith(`${path}.`) && file.endsWith(".tmp"));
  expect(requests.length, "private atomic writes must request owner-only permissions").toBeGreaterThan(0);
  for (const [, , options] of requests)
    expect(options).toMatchObject({ mode: 0o600 });
  const info = await stat(path);
  expect(info.isFile()).toBe(true);
  if (process.platform !== "win32") expect(info.mode & 0o777).toBe(0o600);
}
