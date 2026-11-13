// Owned isolated daemon only. Never records pairing URLs, credentials or ticket bodies/titles.
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { launch, shot, pageText } from '../promo/shot-lib.mjs';

const home = resolve(process.env.TAPD_TEST_HOME || '.test-data/tapd-runtime-20261113');
if (!home.startsWith(resolve('.test-data') + sep)) throw new Error('An isolated owned home is required');
const out = resolve('docs/verification/tapd-live'); await mkdir(out, { recursive: true });
const stateFile = join(home, 'tapd-fixture.json');
const state = existsSync(stateFile) ? JSON.parse(await readFile(stateFile, 'utf8')) : {};
const save = () => writeFile(stateFile, JSON.stringify(state));
const lock = JSON.parse(await readFile(join(home, 'paseo.pid'), 'utf8'));
const credential = (await readFile(join(home, 'local-credential'), 'utf8')).trim();
const client = new DaemonClient({ url: `ws://${lock.listen.replace(/^tcp:\/\//, '')}/ws`, clientId: 'flowly-tapd-live', clientType: 'cli', localCredential: () => credential, reconnect: { enabled: false } });
const rpc = (method, input = {}) => client.invokePluginRpc('flowly', method, input);
const report = { checks: [], errors: [], cleanup: {} };
const check = (pass, label) => { report.checks.push({ pass: !!pass, label }); if (!pass) throw new Error(label); };
let browser, context, page;
try {
  await client.connect();
  const plugin = (await client.listPlugins()).find(p => p.id === 'flowly');
  check(plugin?.status === 'running', 'Installed candidate running');
  check((await rpc('telemetry.status')).forcedOff, 'Fixture telemetry forced off');
  const initial = await rpc('board.read');
  if (state.project && !initial.projects.some(p => p.id === state.project.id)) { delete state.project; delete state.card; delete state.connection; delete state.imported; await save(); }
  const root = join(home, 'fixture-project'); await mkdir(root, { recursive: true });
  if (!state.project) { state.project = await rpc('projects.create', { title: 'TAPD verification', description: '', primaryPath: root }); await save(); }
  if (!state.card) { state.card = await rpc('tasks.create', { projectId: state.project.id, operationId: 'tapd-empty-card', title: 'TAPD input fixture', description: '', status: 'todo', mode: 'directory' }); await save(); }
  if (!state.connection) { state.connection = await rpc('connectors.connection-save', { provider: 'tapd-internal', name: 'TAPD verification connection', baseUrl: `https://tapd.woa.com/tapd_fe/${process.env.FLOWLY_TAPD_PROJECT}` }); await save(); }
  check(!('secret' in state.connection), 'Public connection has no credential');
  const found = await rpc('connectors.search', { connectionId: state.connection.id, query: `story-${Number(process.env.FLOWLY_TAPD_ID.slice(-9))}` });
  check(found.results.length === 1 && found.results[0].remoteId === process.env.FLOWLY_TAPD_ID, 'Installed RPC resolves short ID');
  const item = found.results[0];
  // Discover installed browser tools, never hard-code a cache path.
  const dirs = (p) => { try { return readdirSync(p).map(n => join(p, n)); } catch { return []; } };
  const caches = [process.env.npm_config_cache, process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'npm-cache'), join(homedir(), '.npm')].filter(Boolean);
  process.env.PLAYWRIGHT_MODULE ||= caches.flatMap(c => dirs(join(c, '_npx'))).map(p => join(p, 'node_modules', 'playwright')).find(p => existsSync(join(p, 'package.json')));
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||= [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'), join(homedir(), '.cache', 'ms-playwright')].filter(Boolean).flatMap(dirs).filter(p => /chromium-\d+$/.test(p)).flatMap(p => ['chrome-win/chrome.exe', 'chrome-win64/chrome.exe', 'chrome-linux/chrome'].map(x => join(p, x))).find(existsSync);
  browser = await launch(); context = await browser.newContext({ viewport: { width: 1700, height: 1000 }, locale: 'en-US' });
  await context.grantPermissions(['local-network-access'], { origin: 'https://app.paseo.sh' });
  page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', e => report.errors.push(e.name));
  const offer = await client.getDaemonPairingOffer();
  await page.goto(offer.url, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^(Connect|连接)$/ }).click();
  await page.getByText('Flowly', { exact: true }).first().waitFor();
  const status = await client.getDaemonStatus();
  const serverId = status.serverId || status.daemon?.serverId;
  if (!serverId) throw new Error('Fixture server ID missing');
  await page.goto(`https://app.paseo.sh/h/${serverId}/plugin/flowly/surface/board`, { waitUntil: 'domcontentloaded' });
  // The server ID is checked independently of the host's auto-discovery.
  check(new URL(page.url()).pathname.includes(`/h/${serverId}/plugin/flowly/surface/board`), 'Browser bound to candidate screen');
  const skip = page.getByRole('button', { name: /^(Skip|跳过)$/ });
  if (await skip.isVisible({ timeout: 6000 }).catch(() => false)) await skip.click();
  await page.waitForTimeout(2000);
  for (const button of await page.getByRole('button', { name: /^(Got it|知道了)$/ }).all()) if (await button.isVisible()) await button.click();
  const settings = page.getByRole('button', { name: /^(Settings|设置)$/ });
  let pluginSettings;
  for (const button of await settings.all()) { const box = await button.boundingBox(); if (box && box.x >= 320) pluginSettings = button; }
  if (!pluginSettings) throw new Error('Plugin settings button not found');
  await pluginSettings.click();
  await page.getByText(/^(Connections|连接)$/, { exact: true }).last().click();
  await page.getByText(/^(Add a TAPD connection|添加 TAPD 连接)$/, { exact: true }).click();
  const s = { page, context, project: 'TAPD verification', w: 1700, h: 1000, clip: { x: 320, y: 0, width: 1380, height: 1000 } };
  for (const width of [1700, 750]) {
    await page.setViewportSize({ width, height: 1000 }); s.w = width; s.clip.width = width - 320;
    const text = await pageText(s);
    check(/tapd MCP/.test(text), `${width}px: TAPD MCP guidance visible`);
    check(!/Personal access token|API token|个人访问令牌/.test(text), `${width}px: no token input`);
    await shot(s, join(out, `connection-${width}.png`));
  }
  await page.getByRole('button', { name: /^(Back to connections|返回连接)$/ }).click();
  await page.getByRole('button', { name: /^(Close|关闭)$/ }).last().click();
  await page.setViewportSize({ width: 1700, height: 1000 }); s.w = 1700; s.clip.width = 1380;
  await page.getByRole('button', { name: /^(New task|新建任务)$/ }).first().click();
  check(await page.getByRole('button', { name: /^(From TAPD|从 TAPD)$/ }).isVisible(), 'New task has From TAPD');
  await shot(s, join(out, 'new-task.png'));
  await page.getByRole('button', { name: /^(Cancel|取消)$/ }).last().click();
  // Ticket content is used only after screenshots and is never exported.
  const imported = await rpc('tasks.create', { projectId: state.project.id, operationId: 'tapd-import-card', title: 'TAPD import verification', description: '', status: 'todo', mode: 'directory', externals: [{ connectionId: state.connection.id, key: item.key, itemType: item.itemType }] });
  state.imported = { id: imported.id, workspaceId: imported.workspaceId }; await save();
  check(imported.description.length > 0 && imported.status === 'todo', 'Installed card imports body and keeps business status');
  const board = await rpc('board.read');
  const artifact = board.artifacts.find(a => a.taskId === imported.id && a.external);
  check(!!artifact && artifact.role === 'input', 'Card persists TAPD input');
  const detail = await rpc('connectors.read', { artifactId: artifact.id, refresh: true });
  check(detail.markdown.includes('## Description') && detail.summary.remoteId === item.remoteId, 'Installed artifact reads full body/comments');
  await client.reloadPlugin('flowly');
  const after = await rpc('board.read');
  check(after.artifacts.some(a => a.id === artifact.id) && after.tasks.some(t => t.id === imported.id && t.description === imported.description), 'Connection and imported input survive plugin reload');
} catch (error) {
  report.failure = error.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 300); process.exitCode = 1;
  if (page) {
    const debug = { page, project: 'TAPD verification', clip: { x: 320, y: 0, width: (page.viewportSize()?.width || 1700) - 320, height: 1000 } };
    await writeFile(join(home, 'ui-failure.txt'), await pageText(debug)).catch(() => {});
    await shot(debug, join(home, 'ui-failure.png')).catch(() => {});
  }
} finally {
  await context?.close(); await browser?.close();
  if (state.connection) { await rpc('connectors.connection-delete', { id: state.connection.id }).then(() => { report.cleanup.connection = true; }, () => { report.cleanup.connection = false; }); }
  if (state.project) {
    const board = await rpc('board.read').catch(() => null);
    const project = board?.projects.find(p => p.id === state.project.id);
    if (project) await rpc('projects.remove', { id: project.id, revision: project.revision, alsoPaseo: true }).then(x => { report.cleanup.project = !x.paseo?.error; }, () => { report.cleanup.project = false; });
    const remaining = await rpc('board.read').catch(() => null);
    report.cleanup.boardEmpty = remaining && !remaining.projects.length && !remaining.tasks.length;
    const native = await client.listProjects().catch(() => null);
    report.cleanup.nativeProjectGone = native && !JSON.stringify(native).includes(state.project.paseoProjectId);
    if (report.cleanup.boardEmpty && report.cleanup.nativeProjectGone && report.cleanup.connection) { delete state.project; delete state.card; delete state.connection; delete state.imported; await save(); }
  }
  await client.close(); report.cleanup.browserClosed = true;
  await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
