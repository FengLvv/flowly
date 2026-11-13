import { expect, test } from "vitest";
import { tapdAdapter } from "./tapd";
import type { StoredConnection } from "./http";
import { tapdKey } from "../../shared/tapd";

// Explicit opt-in; credentials stay inside the user's mcporter configuration.
test.skipIf(process.env.FLOWLY_TAPD_LIVE !== "1")("internal TAPD MCP: membership, recent items, short ID, body and comments", async () => {
  const project = process.env.FLOWLY_TAPD_PROJECT!;
  const id = process.env.FLOWLY_TAPD_ID!;
  const c: StoredConnection = { id: "live-read-only", provider: "tapd-internal", name: "TAPD", baseUrl: `https://tapd.woa.com/tapd_fe/${project}`, email: "", secret: "", account: "", login: "", verifiedAt: "", authFailed: false };
  expect((await tapdAdapter.verify(c, fetch)).account).toBeTruthy();
  const recent = await tapdAdapter.search(c, fetch, "", { repos: [], all: false });
  expect(recent.length).toBeGreaterThan(0);
  expect(recent.every((r) => r.summary.key.startsWith(`tapd:${project}:`))).toBe(true);
  const found = await tapdAdapter.get(c, fetch, { itemType: "story", key: tapdKey(project, "story", id) }, true);
  expect(found.summary.remoteId).toBe(id);
  expect(tapdAdapter.description!(found.full).length).toBeGreaterThan(0);
  expect(tapdAdapter.markdown(found.summary, found.full, 32000).markdown).toContain("## Description");
  expect(tapdAdapter.fingerprint(found.full)).toMatch(/^[a-f0-9]{16}$/);
  const short = await tapdAdapter.get(c, fetch, { itemType: "story", key: tapdKey(project, "story", String(Number(id.slice(-9)))) }, false);
  expect(short.summary.remoteId).toBe(id);
}, 60000);
