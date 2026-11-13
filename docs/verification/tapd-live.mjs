// Owned isolated host only. Export booleans/tool names, never ticket content or credentials.
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { launch, shot, pageText, openCard, closeCard, hidePrivate } from '../promo/shot-lib.mjs';

if (!process.env.TAPD_TEST_HOME) throw new Error('Set TAPD_TEST_HOME to an owned isolated home');
const home = resolve(process.env.TAPD_TEST_HOME);
if (!home.startsWith(resolve('.test-data') + sep)) throw new Error('Refused a home outside .test-data');
const owner = JSON.parse(await readFile(join(home, 'test-owner.json'), 'utf8'));
if (resolve(owner.home) !== home || owner.owner !== 'babd8fb9-54c0-4e3d-aafd-450deb851cfa') throw new Error('Fixture ownership mismatch');
const workspace = String(process.env.FLOWLY_TAPD_PROJECT || '');
const remoteId = String(process.env.FLOWLY_TAPD_ID || '');
if (!/^[1-9]\d{0,9}$/.test(workspace) || !/^[1-9]\d{18}$/.test(remoteId)) throw new Error('Set valid TAPD project/item IDs');
const out = resolve('docs/verification/tapd-ui-followup'); await mkdir(out, { recursive: true });
const state = { agents: [] }, report = { checks: [], cleanup: {}, pageErrors: [], dailyHostMutated: false };
const save = () => writeFile(join(home, 'tapd-fixture.json'), JSON.stringify(state));
const check = (pass, label) => { report.checks.push({ pass: !!pass, label }); console.log(JSON.stringify({ pass: !!pass, label })); if (!pass) throw new Error(label); };
const lock = JSON.parse(await readFile(join(home, 'paseo.pid'), 'utf8'));
const credential = (await readFile(join(home, 'local-credential'), 'utf8')).trim();
const client = new DaemonClient({ url: `ws://${lock.listen.replace(/^tcp:\/\//, '')}/ws`, clientId: 'tapd-ui-followup', clientType: 'cli', localCredential: () => credential, reconnect: { enabled: false } });
const rpc = (method, input = {}) => client.invokePluginRpc('flowly', method, input);
let browser, item, needle;
const contexts = [];
const newTask = p => p.getByRole('button', { name: /^New task(?:\s|$)/ }).first();
const choose = p => p.getByRole('button', { name: `Choose ${item.key}: ${item.summary}`, exact: true });
async function settings(id, patch) { const x = await rpc(`settings.${id}.read`); if (x.status !== 'ready') throw new Error('Fixture settings invalid'); await rpc(`settings.${id}.write`, { revision: x.revision, values: { ...x.values, ...patch } }); }
async function openFixture(width, serverId) {
  // Pages are independent; the paired context/cache can be reused. Keeping a
  // second active app/connection only adds work and cold-load failures.
  const fresh = !contexts.length;
  const context = contexts[0] || await browser.newContext({ viewport: { width, height: 1000 }, locale: 'en-US' });
  if (fresh) { contexts.push(context); await context.grantPermissions(['local-network-access'], { origin: 'https://app.paseo.sh' }); }
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => report.pageErrors.push(e.name));
  await page.setViewportSize({ width, height: 1000 });
  if (fresh) {
    const offer = await client.getDaemonPairingOffer();
    await page.goto(offer.url, { waitUntil: 'commit', timeout: 45000 });
    await page.getByRole('button', { name: /^(Connect|连接)$/ }).click();
  }
  // Never open Flowly on an auto-discovered daily host first.
  await page.goto(`https://app.paseo.sh/h/${serverId}/plugin/flowly/surface/board`, { waitUntil: 'commit', timeout: 45000 });
  await newTask(page).waitFor({ timeout: 30000 });
  check(new URL(page.url()).pathname.includes(`/h/${serverId}/plugin/flowly/`), `${width}px: isolated host bound and board ready`);
  return { page, context, project: 'TAPD UI acceptance', w: width, h: 1000, clip: { x: 320, y: 0, width: width - 320, height: 1000 } };
}
async function pick(page, query) {
  await page.getByRole('textbox', { name: 'Search TAPD', exact: true }).fill(query);
  await choose(page).waitFor({ timeout: 30000 }); await choose(page).click();
}
async function createFromUi(s, name, description, query) {
  const p = s.page; await newTask(p).click(); await p.getByRole('button', { name: 'From TAPD', exact: true }).waitFor();
  if (description) await p.getByRole('textbox', { name: 'Description', exact: true }).fill(description);
  await p.getByRole('button', { name: 'From TAPD', exact: true }).click(); await pick(p, query);
  check(await p.getByRole('textbox', { name: 'Title', exact: true }).inputValue() === item.summary, `${name}: title prefilled`);
  check(await p.getByRole('textbox', { name: 'Description', exact: true }).inputValue() === description, `${name}: user description unchanged before save`);
  await p.getByRole('textbox', { name: 'Title', exact: true }).fill(name);
  // The fixture preference defaults this off; never start an AI from a form.
  await p.getByRole('button', { name: 'Create task', exact: true }).click();
  await p.getByRole('textbox', { name: 'Title', exact: true }).waitFor({ state: 'hidden', timeout: 30000 });
  const task = (await rpc('board.read')).tasks.find(t => t.title === name);
  if (!task) throw new Error('UI-created task missing');
  state[name] = { id: task.id, workspaceId: task.workspaceId }; await save(); return task;
}
async function pickerFromArtifacts(p) {
  await p.getByRole('button', { name: 'Add an artifact: a file, link, or an item from a connected service', exact: true }).click();
  await p.getByText('TAPD work item…', { exact: true }).click();
  await p.getByRole('textbox', { name: 'Search TAPD', exact: true }).waitFor();
}
const parseMcp = text => { try { return JSON.parse(text); } catch { return JSON.parse(text.split('\n').find(x => x.startsWith('data: ')).slice(6)); } };
async function sessionTools(task) {
  const prep = await rpc('tools.prepare-session', { id: task.id, operationId: `tapd-ui-session-tool-${task.id}` });
  state.agents.push(prep.agentId); await save();
  const models = await client.listProviderModels('claude'), modes = await client.listProviderModes('claude');
  check(models.models.some(m => m.id === 'claude-haiku-5-5') && modes.modes.some(m => m.id === 'bypassPermissions'), 'Explicit test model/full mode available');
  const agent = await client.createAgent({ agentId: prep.agentId, provider: 'claude', model: 'claude-haiku-5-5', modeId: 'bypassPermissions', cwd: task.sourcePath, workspaceId: task.workspaceId, title: 'TAPD scoped MCP fixture', idempotencyKey: `tapd-ui-session-tool-${prep.agentId}` });
  check(agent.currentModeId === 'bypassPermissions', 'Test session created in full access');
  const prepared = await rpc('tools.prepare-existing', { id: task.id, agentId: agent.id });
  const context = JSON.parse(await readFile(prepared.contextFile, 'utf8'));
  const discovery = JSON.parse(await readFile(context.discoveryFile, 'utf8'));
  const headers = { Authorization: `Bearer ${context.credential}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const url = new URL('mcp', discovery.url); let serial = 1;
  const request = async (method, params) => { const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: serial++, method, params }), signal: AbortSignal.timeout(30000) }); if (response.headers.get('mcp-session-id')) headers['Mcp-Session-Id'] = response.headers.get('mcp-session-id'); return parseMcp(await response.text()); };
  await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'tapd-ui-scoped-read', version: '1' } }); headers['MCP-Protocol-Version'] = '2025-06-18';
  const call = async (name, args) => (await request('tools/call', { name, arguments: args })).result;
  const value = x => x.structuredContent || JSON.parse(x.content[0].text);
  check(value(await call('flowly_get_task', {})).task.id === task.id, 'MCP get_task uses the actual fixture session/card');
  return { call, value };
}
try {
  await client.connect(); check((await rpc('telemetry.status')).forcedOff, 'Fixture telemetry forced off');
  const initial = await rpc('board.read'); check(initial.projects.length === 0, 'Fixture starts with empty owned board');
  await settings('board-view', { startAgentOnCreate: false });
  await settings('onboarding', { welcomeSeen: true, whatsNewSeen: '1.8.0' });
  await settings('task-summary', { summaryEnabled: false, digestEnabled: false, retroEnabled: false });
  const root = join(home, 'project'); await mkdir(root, { recursive: true });
  state.project = await rpc('projects.create', { title: 'TAPD UI acceptance', primaryPath: root, description: 'Owned TAPD acceptance fixture' }); await save();
  state.project = await rpc('projects.update', { id: state.project.id, revision: state.project.revision, autoReview: { enabled: false, maxRounds: 2 }, memory: false, workflowInsights: false }); await save();
  const blank = await rpc('tasks.create', { projectId: state.project.id, operationId: 'tapd-ui-blank', title: 'TAPD UI fixture', description: 'Owned fixture', status: 'todo', mode: 'directory' }); state.blank = { id: blank.id, workspaceId: blank.workspaceId }; await save();
  state.connection = await rpc('connectors.connection-save', { provider: 'tapd-internal', name: 'TAPD UI connection', baseUrl: `https://tapd.woa.com/tapd_fe/${workspace}` }); await save();
  const matches = await rpc('connectors.search', { connectionId: state.connection.id, query: `story-${remoteId.slice(-9).replace(/^0+/, '')}` }); item = matches.results[0];
  check(matches.results.length === 1 && item.remoteId === remoteId, 'Exact test item resolved without numeric long-ID conversion');
  const dirs = p => { try { return readdirSync(p).map(n => join(p, n)); } catch { return []; } };
  const caches = [process.env.npm_config_cache, process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'npm-cache'), join(homedir(), '.npm')].filter(Boolean);
  process.env.PLAYWRIGHT_MODULE ||= caches.flatMap(c => dirs(join(c, '_npx'))).map(p => join(p, 'node_modules', 'playwright')).find(p => existsSync(join(p, 'package.json')));
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||= [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'), join(homedir(), '.cache', 'ms-playwright')].filter(Boolean).flatMap(dirs).filter(p => /chromium-\d+$/.test(p)).flatMap(p => ['chrome-win/chrome.exe', 'chrome-win64/chrome.exe', 'chrome-linux/chrome'].map(x => join(p, x))).find(existsSync);
  browser = await launch(); const serverId = (await client.getDaemonStatus()).serverId;
  const s = await openFixture(1700, serverId), p = s.page;
  await shot(s, join(out, 'board-navigation.png'));
  check(await newTask(p).isVisible() && await p.getByRole('button', { name: 'All projects (P)', exact: true }).isVisible() && await p.getByRole('button', { name: 'Task filters (/)', exact: true }).isVisible(), 'Capture preserves New task, project chooser and Filter');
  const imported = await createFromUi(s, 'TAPD UI imported fixture', '', `story-${remoteId.slice(-9).replace(/^0+/, '')}`);
  const importedArtifact = (await rpc('board.read')).artifacts.find(a => a.taskId === imported.id && a.external);
  const detail = await rpc('connectors.read', { artifactId: importedArtifact.id });
  const body = detail.markdown.split('## Description\n\n')[1].split('\n\n## Comments')[0].trimEnd();
  needle = body.match(/[\u3400-\u9fff]{4,}/)?.[0] || body.match(/[A-Za-z]{6,}/)?.[0]; if (!needle) throw new Error('No body text available to verify preview');
  check(imported.description === body && imported.status === 'todo', 'UI save imports exact body and keeps business status');
  const custom = 'TAPD acceptance: keep my own description.';
  const preserved = await createFromUi(s, 'TAPD UI user-description fixture', custom, item.url);
  check(preserved.description === custom, 'UI save preserves nonempty user description');
  await openCard(s, 'TAPD UI fixture'); await pickerFromArtifacts(p); await pick(p, item.url);
  await p.getByRole('textbox', { name: 'Search TAPD', exact: true }).waitFor({ state: 'hidden' });
  const linked = (await rpc('board.read')).artifacts.filter(a => a.taskId === blank.id && a.external), art = linked[0];
  check(linked.length === 1 && art.external.remoteId === remoteId && art.role === 'input', 'Artifacts + links one TAPD input by URL');
  const artName = `Input: ${art.title}, Added by you`;
  await p.getByRole('button', { name: artName, exact: true }).click(); await p.getByText(needle, { exact: false }).first().waitFor({ timeout: 30000 }); check(await p.getByText(needle, { exact: false }).first().isVisible(), 'Desktop preview renders actual body'); await p.getByRole('button', { name: 'Close', exact: true }).click();
  await pickerFromArtifacts(p); await p.getByRole('textbox', { name: 'Search TAPD', exact: true }).fill(item.url); await choose(p).waitFor({ timeout: 30000 });
  check(await choose(p).getAttribute('aria-disabled') === 'true' && (await rpc('board.read')).artifacts.filter(a => a.taskId === blank.id && a.external).length === 1, 'Desktop duplicate selection disabled, one input remains'); await p.getByRole('button', { name: 'Close', exact: true }).click();
  await p.close();
  const compact = await openFixture(750, serverId), cp = compact.page;
  await newTask(cp).click(); await cp.getByRole('button', { name: 'From TAPD', exact: true }).waitFor();
  const box = await cp.getByRole('button', { name: 'From TAPD', exact: true }).boundingBox(); check(box.x >= 0 && box.x + box.width <= 750, 'Compact From TAPD control inside full viewport');
  await shot(compact, join(out, 'compact-new-task.png')); await cp.getByRole('button', { name: 'From TAPD', exact: true }).click(); await pick(cp, item.url); check(await cp.getByRole('textbox', { name: 'Title', exact: true }).inputValue() === item.summary, 'Compact URL selection prefills title'); await cp.getByRole('button', { name: 'Cancel', exact: true }).click();
  await openCard(compact, 'TAPD UI fixture'); await cp.getByRole('button', { name: artName, exact: true }).click(); const bodyText = cp.getByText(needle, { exact: false }).first(); await bodyText.waitFor({ timeout: 30000 }); const bounds = await bodyText.boundingBox(); check(await bodyText.isVisible() && bounds.x >= 0 && bounds.x + bounds.width <= 750, 'Compact preview body visible inside full viewport'); await cp.getByRole('button', { name: 'Close', exact: true }).click();
  await pickerFromArtifacts(cp); await cp.getByRole('textbox', { name: 'Search TAPD', exact: true }).fill(item.url); await choose(cp).waitFor({ timeout: 30000 }); check(await choose(cp).getAttribute('aria-disabled') === 'true', 'Compact duplicate selection disabled'); await cp.getByRole('button', { name: 'Close', exact: true }).click();
  const tools = await sessionTools(blank); const read = await tools.call('flowly_read_external', { artifactId: art.id, refresh: true }); check(!read.isError && tools.value(read).markdown.includes(needle), 'Actual session MCP reads linked TAPD body'); const denied = await tools.call('flowly_read_external', { artifactId: importedArtifact.id }); check(denied.isError && tools.value(denied).error.code === 'EXTERNAL_NOT_FOUND', 'Actual session MCP refuses another card artifact');
  await client.reloadPlugin('flowly'); const after = await rpc('board.read'); check(after.tasks.find(t => t.id === imported.id)?.description === body && after.artifacts.some(a => a.id === art.id), 'UI-created descriptions and artifact survive isolated plugin reload');
  check(report.pageErrors.length === 0, 'No browser page errors');
} catch (error) {
  let message = String(error.message); for (const value of [item?.summary, needle, item?.url, item?.key]) if (value) message = message.replaceAll(value, '[test item]');
  report.failure = message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 250); process.exitCode = 1;
} finally {
  await Promise.allSettled(contexts.map(c => c.close())); await browser?.close().catch(() => {});
  for (const id of state.agents) await client.deleteAgent(id).catch(() => { report.cleanup.agentDeleteFailed = true; });
  if (state.connection) await rpc('connectors.connection-delete', { id: state.connection.id }).then(() => { report.cleanup.connection = true; }, () => { report.cleanup.connection = false; });
  if (state.project) {
    const board = await rpc('board.read').catch(() => null), current = board?.projects.find(p => p.id === state.project.id);
    if (current) await rpc('projects.remove', { id: current.id, revision: current.revision, alsoPaseo: true }).then(r => { report.cleanup.project = !r.paseo?.error; }, () => { report.cleanup.project = false; });
    const remaining = await rpc('board.read').catch(() => null), native = await client.listProjects().catch(() => null), resources = await rpc('resources.list').catch(() => null);
    report.cleanup.boardEmpty = !!remaining && !remaining.projects.length && !remaining.tasks.length;
    report.cleanup.nativeProjectGone = !!native && !JSON.stringify(native).includes(state.project.paseoProjectId);
    report.cleanup.nativeWorkspacesEmpty = !!resources && resources.workspaces.length === 0;
    const agents = await Promise.all(state.agents.map(id => client.fetchAgent(id).catch(() => undefined)));
    report.cleanup.nativeAgentsEmpty = agents.every(agent => agent === null);
  }
  await client.close(); report.cleanup.browserClosed = true;
  if (!report.cleanup.boardEmpty || !report.cleanup.nativeProjectGone || !report.cleanup.nativeWorkspacesEmpty || !report.cleanup.nativeAgentsEmpty || report.cleanup.agentDeleteFailed) process.exitCode = 1;
  await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
