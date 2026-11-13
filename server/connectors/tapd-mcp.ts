import { execFile } from "node:child_process";
import { access, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { z } from "zod";
import { ExternalError } from "./http";

const project = z.string().regex(/^[1-9]\d{0,9}$/);
const id = z.string().regex(/^[1-9]\d{18}$/);
const kind = z.enum(["story", "bug", "task"]);
const list = {
  workspace_id: project, id: id.optional(), page: z.literal(1), limit: z.number().int().min(1).max(20),
  fields: z.literal("id,name,title,description,status,v_status,priority,priority_label,owner,current_owner,modified,workspace_id").optional(),
};
// Exact operations and parameters: no generic proxy is exposed to RPC or agent callers.
const schemas = {
  user_participant_workspace_get: z.strictObject({}),
  tapd_id_get: z.strictObject({ short_id: z.number().int().min(1).max(999999999), type: kind }),
  stories_get: z.strictObject({ ...list, with_v_status: z.literal("1").optional(), name: z.string().max(200).optional(), order: z.literal("modified desc").optional() }),
  bugs_get: z.strictObject({ ...list, title: z.string().max(200).optional(), order: z.literal("modified desc").optional() }),
  tasks_get: z.strictObject({ ...list, name: z.string().max(200).optional() }),
  comments_get: z.strictObject({ workspace_id: project, entry_type: kind, entry_id: id, page: z.literal(1), limit: z.number().int().min(1).max(20) }),
};
export type TapdTool = keyof typeof schemas;
export type TapdCall = (tool: TapdTool, args: Record<string, unknown>) => Promise<unknown>;

/** Resolve code only, never read or copy MCP configuration/credentials. */
export async function tapdRuntimePath(path = process.env.PATH || "") {
  for (const entry of path.split(delimiter).filter(Boolean)) {
    const candidates = [
      join(entry, "node_modules", "@tencent", "mcporter-internal", "dist", "index.js"),
      join(entry, "node_modules", "mcporter", "dist", "index.js"),
      join(entry, "..", "lib", "node_modules", "mcporter", "dist", "index.js"),
      join(entry, "..", "lib", "node_modules", "@tencent", "mcporter-internal", "dist", "index.js"),
    ];
    const binary = await realpath(join(entry, "mcporter")).catch(() => "");
    if (binary) candidates.unshift(join(dirname(binary), "index.js"));
    for (const candidate of candidates) if (await access(candidate).then(() => true, () => false)) return candidate;
  }
  throw new ExternalError("EXTERNAL_UNAVAILABLE", "Install mcporter on the Paseo host and configure its tapd MCP server, then test the connection again.");
}

// A constant program, data passed through argv, no shell. Using the runtime API
// avoids mcporter CLI's inspect-formatted non-JSON empty/error responses.
const bridge = `
import {pathToFileURL} from 'node:url';
const [modulePath, tool, payload] = process.argv.slice(1);
let runtime;
try {
  const {createRuntime} = await import(pathToFileURL(modulePath).href);
  const noop = () => {};
  runtime = await createRuntime({rootDir: process.cwd(), logger: {info:noop,warn:noop,error:noop,debug:noop}});
  const result = await runtime.callTool('tapd', 'proxy_execute_tool', {args:{tool_name:tool,tool_args:JSON.parse(payload)},timeoutMs:20000});
  process.stdout.write('FLOWLY_TAPD_RESULT:' + JSON.stringify(result));
} catch (e) {
  const auth = /401|403|unauthori|forbidden|authentication|permission denied|未授权|无权限|登录/.test(String(e?.message || ''));
  process.stdout.write('FLOWLY_TAPD_RESULT:' + JSON.stringify({bridgeError:auth?'auth':'unavailable'}));
} finally { if (runtime) await runtime.close().catch(() => {}); }
`;

export function parseTapdResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") throw new ExternalError("EXTERNAL_INVALID", "TAPD returned an invalid response.");
  const x = value as Record<string, unknown>;
  if (x.bridgeError) throw new ExternalError(x.bridgeError === "auth" ? "EXTERNAL_AUTH" : "EXTERNAL_UNAVAILABLE", x.bridgeError === "auth" ? "TAPD authentication failed. Sign in to the host's tapd MCP server and test the connection again." : "Couldn't reach the host's tapd MCP server. Check its mcporter configuration and try again.");
  if (x.isError || x.status === "error" || x.status === "failed" || x.success === false || (typeof x.status === "number" && x.status >= 400)) {
    const s = JSON.stringify(x);
    const auth = /401|403|unauthori|forbidden|authentication|permission denied|无权限|未授权|登录/i.test(s);
    throw new ExternalError(auth ? "EXTERNAL_AUTH" : "EXTERNAL_UNAVAILABLE", auth ? "TAPD refused access. Check the host's tapd MCP login and project access, then test the connection again." : "TAPD couldn't complete the read. Try again shortly.");
  }
  if (x.structuredContent) return parseTapdResponse(x.structuredContent);
  if (Array.isArray(x.content)) {
    const text = x.content.filter((c) => c?.type === "text").map((c) => c.text).join("\n").trim();
    if (/^没有找到相关的资源数据[,，]/.test(text)) return [];
    try { return parseTapdResponse(JSON.parse(text)); }
    catch (e) { if (e instanceof ExternalError) throw e; }
    const auth = /401|403|unauthori|forbidden|authentication|无权限|未授权|登录/i.test(text);
    throw new ExternalError(auth ? "EXTERNAL_AUTH" : "EXTERNAL_INVALID", auth ? "TAPD refused access. Check the host's tapd MCP login and project access." : "TAPD returned an unreadable result.");
  }
  return x;
}

export function createTapdReader(execute: typeof execFile = execFile, locate = tapdRuntimePath): TapdCall {
 return async (tool, args) => {
  if (!Object.hasOwn(schemas, tool)) throw new ExternalError("EXTERNAL_INVALID", "Refused a tool outside TAPD's read-only whitelist.");
  const parsed = schemas[tool].safeParse(args);
  if (!parsed.success) throw new ExternalError("EXTERNAL_INVALID", "Refused invalid TAPD read parameters.");
  const modulePath = await locate();
  const stdout = await new Promise<string>((resolve, reject) => {
    execute("node", ["--input-type=module", "--eval", bridge, modulePath, tool, JSON.stringify(parsed.data)], {
      cwd: homedir(), timeout: 25_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, FLOWLY_TELEMETRY: "0", DO_NOT_TRACK: "1" },
    }, (error, output) => error ? reject(new ExternalError("EXTERNAL_UNAVAILABLE", "TAPD MCP read failed or timed out. Check Node, mcporter and the host's tapd MCP connection.")) : resolve(output));
  });
  const marker = "FLOWLY_TAPD_RESULT:";
  const offset = stdout.indexOf(marker);
  if (offset < 0) throw new ExternalError("EXTERNAL_INVALID", "TAPD MCP returned no result.");
  let value: unknown;
  try { value = JSON.parse(stdout.slice(offset + marker.length)); }
  catch { throw new ExternalError("EXTERNAL_INVALID", "TAPD MCP returned invalid JSON."); }
  return parseTapdResponse(value);
 };
}
export const readTapd = createTapdReader();
