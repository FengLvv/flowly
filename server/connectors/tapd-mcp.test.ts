import { beforeEach, describe, expect, test, vi } from "vitest";
import type { execFile } from "node:child_process";
import { createTapdReader, parseTapdResponse, type TapdTool } from "./tapd-mcp";
const run = vi.fn();
const readTapd = createTapdReader(run as unknown as typeof execFile, async () => "runtime.js");
beforeEach(() => { run.mockReset(); });

describe("TAPD MCP response boundaries", () => {
  test("unwraps actual MCP text JSON and explicit empty-data messages without evaluating text", () => {
    expect(parseTapdResponse({ content: [{ type: "text", text: '{"data":[{"id":"1000000042000000123"}]}' }] })).toEqual({ data: [{ id: "1000000042000000123" }] });
    expect(parseTapdResponse({ content: [{ type: "text", text: "没有找到相关的资源数据,请检查后重试\n\n[TAPD-REQUEST-ID: hidden]" }], isError: false })).toEqual([]);
    expect(() => parseTapdResponse({ content: [{ type: "text", text: 'process.exit()' }] })).toThrow(/unreadable/);
  });
  test.each([
    { isError: true, content: [{ type: "text", text: "403 permission denied" }] },
    { success: false, message: "未授权" },
    { status: 401 }, { bridgeError: "auth" },
  ])("authentication failure is not an empty result: %j", (result) => {
    try { parseTapdResponse(result); throw new Error("Expected error"); }
    catch (e) { expect(e).toMatchObject({ code: "EXTERNAL_AUTH" }); }
  });
  test.each([null, 19, "[]", { content: [{ type: "text", text: "Unknown API failure" }] }])("rejects malformed responses: %j", (value) => expect(() => parseTapdResponse(value)).toThrow());
  test("error details with secrets never reach callers", () => {
    const error = { isError: true, content: [{ type: "text", text: "500 token=very-private https://user:secret@host" }] };
    expect(() => parseTapdResponse(error)).toThrow("TAPD couldn't complete the read.");
    try { parseTapdResponse(error); } catch (e) { expect(String(e)).not.toMatch(/private|secret@/); }
  });
});
describe("TAPD MCP execution", () => {
  test.each([
    ["stories_create", {}], ["proxy_execute_tool", {}],
    ["stories_get", { workspace_id: "42", limit: 21, page: 1 }],
    ["stories_get", { workspace_id: "42", limit: 1, page: 1, query_token: "x" }],
    ["stories_get", { workspace_id: "42;bad", limit: 1, page: 1 }],
    ["stories_get", { workspace_id: "42", id: 1000000042000000123, limit: 1, page: 1 }],
    ["comments_get", { workspace_id: "42", entry_id: "1000000042000000123", entry_type: "wiki", page: 1, limit: 1 }],
    ["tapd_id_get", { short_id: 1000000000, type: "story" }],
  ])("rejects disallowed operations/args before starting Node: %s", async (tool, args) => {
    await expect(readTapd(tool as TapdTool, args as Record<string, unknown>)).rejects.toMatchObject({ code: "EXTERNAL_INVALID" });
    expect(run).not.toHaveBeenCalled();
  });
  test("uses fixed Node argv and MCP server, bounded execution, no shell, JSON only", async () => {
    run.mockImplementation((_file, _args, _options, cb) => cb(null, 'FLOWLY_TAPD_RESULT:{"content":[{"type":"text","text":"[]"}]}'));
    expect(await readTapd("stories_get", { workspace_id: "42", page: 1, limit: 1, name: 'hello " quoted' })).toEqual([]);
    const [file, args, options] = run.mock.calls[0]!;
    expect(file).toBe("node");
    expect(args[2]).toContain("runtime.callTool('tapd', 'proxy_execute_tool'");
    expect(args[2]).not.toContain('hello');
    expect(JSON.parse(args.at(-1))).toMatchObject({ name: 'hello " quoted' });
    expect(options).toMatchObject({ timeout: 25000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    expect(options.shell).toBeUndefined();
    expect(options.cwd).not.toBe(process.cwd());
  });
  test("timeout, missing Node and child errors do not leak stderr", async () => {
    run.mockImplementation((_file, _args, _options, cb) => cb(new Error('secret-auth-error'), '', 'token=private'));
    await expect(readTapd("user_participant_workspace_get", {})).rejects.toMatchObject({ code: "EXTERNAL_UNAVAILABLE" });
    await expect(readTapd("user_participant_workspace_get", {})).rejects.not.toThrow(/secret|private/);
  });
});
