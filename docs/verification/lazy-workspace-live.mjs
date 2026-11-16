// Owned isolated host only. Never operates native user windows or daily canvas state.
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, openSync, closeSync } from 'node:fs';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve, sep, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer, connect } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { launch, shot, pageText, openCard } from '../promo/shot-lib.mjs';

const root = resolve('.'), owner = `lazy-workspace-${randomUUID()}`;
const home = resolve('.test-data', owner), out = resolve('docs/verification/lazy-workspace');
const app = join(process.env.LOCALAPPDATA, 'Programs/Paseo/Paseo.exe');
const resources = join(process.env.LOCALAPPDATA, 'Programs/Paseo/resources');
const runner = join(resources, 'app.asar.unpacked/dist/daemon/node-entrypoint-runner.js');
const cli = join(resources, 'app.asar/node_modules/@getpaseo/cli/dist/index.js');
const state = { owner, home }, report = { checks: [], cleanup: {}, pageErrors: [] };
let child, client, browser, connection, project, task, webServer, webUrl;
const contexts = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const listening = port => new Promise(resolve => { const s = connect(port, '127.0.0.1'); s.setTimeout(500); s.once('connect', () => { s.destroy(); resolve(true); }); s.once('error', () => resolve(false)); s.once('timeout', () => { s.destroy(); resolve(false); }); });
const check = (pass, label) => { report.checks.push({ pass: !!pass, label }); console.log(JSON.stringify({ pass: !!pass, label })); if (!pass) throw Error(label); };
const cliArgs = args => ['--disable-warning=DEP0040', runner, 'node-script', cli, ...args];
const rpc = (method, input = {}) => client.invokePluginRpc('flowly', method, input);
const saveState = () => writeFile(join(out, 'owned-resources.json'), JSON.stringify(state, null, 2));
const bound = async locator => { const b = await locator.boundingBox(); return !!b && b.x >= 0 && b.width > 0 && b.x + b.width <= locator.page().viewportSize().width; };
async function settings(id, patch) { const s = await rpc(`settings.${id}.read`); await rpc(`settings.${id}.write`, { revision: s.revision, values: { ...s.values, ...patch } }); }
async function openPage(width, serverId, first = false) {
  const context = first ? await browser.newContext({ viewport: { width, height: 1000 }, locale: 'en-US' }) : contexts[0];
  if (first) { contexts.push(context); await context.grantPermissions(['local-network-access'], { origin: webUrl }); }
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.pageErrors.push(e.name));
  await page.setViewportSize({ width, height: 1000 });
  if (first) { const offer = await client.getDaemonPairingOffer(); if (!offer.url) throw Error('Fixture pairing offer unavailable'); await page.goto(webUrl + '/' + new URL(offer.url).hash, { waitUntil: 'domcontentloaded', timeout: 45000 }); const connect = page.getByRole('button', { name: /^(Connect|连接)$/ }); await connect.waitFor({ timeout: 45000 }); await connect.click(); }
  await page.goto(`${webUrl}/h/${serverId}/plugin/flowly/surface/board`, { waitUntil: 'commit', timeout: 45000 });
  await page.getByRole('button', { name: /^New task(?:\s|$)/ }).first().waitFor({ timeout: 45000 });
  check(new URL(page.url()).pathname.includes(`/h/${serverId}/plugin/flowly/`), `${width}px isolated host bound`);
  return { page, context, project: 'Lazy workspace fixture', w: width, h: 1000, clip: { x: 320, y: 0, width: width - 320, height: 1000 } };
}
try {
  await mkdir(home, { recursive: false }); await mkdir(out, { recursive: true });
  await writeFile(join(home, 'owner.json'), JSON.stringify(state)); await saveState();
  // Serve the installed Paseo renderer locally: public app hosting was timing
  // out, and this also matches the fixture daemon's actual desktop version.
  const webRoot = join(resources, 'app-dist');
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  webServer = createHttpServer(async (req, res) => {
    try {
      let file = resolve(webRoot, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!file.startsWith(webRoot + sep) && file !== webRoot) { res.writeHead(403); res.end(); return; }
      if (file === webRoot || !existsSync(file)) file = join(webRoot, 'index.html');
      res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => webServer.listen(0, '127.0.0.1', r)); webUrl = `http://127.0.0.1:${webServer.address().port}`;
  const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r)); state.port = port; await saveState();
  await writeFile(join(home, 'config.json'), JSON.stringify({ version: 1, pluginsEnabled: true, daemon: { listen: `127.0.0.1:${port}` } }));
  const bin = join(home, 'bin'); await mkdir(bin);
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', PASEO_NODE_ENV: 'production', PASEO_HOME: home, PASEO_RELAY_ENABLED: 'true', FLOWLY_TELEMETRY: '0', DO_NOT_TRACK: '1', PATH: bin + ';' + process.env.PATH, PASEO_CLI: join(resources, 'bin/paseo.cmd') };
  const log = openSync(join(home, 'daemon-stdio.log'), 'a');
  child = spawn(app, cliArgs(['daemon', 'run', '--home', home]), { env, cwd: root, stdio: ['ignore', log, log], windowsHide: true }); closeSync(log);
  state.daemonPid = child.pid; await saveState();
  const deadline = Date.now() + 120000; let daemonReady = false;
  while (Date.now() < deadline) {
    try { if (await readFile(join(home, 'local-credential'), 'utf8') && await listening(port)) { daemonReady = true; break; } } catch { /* waiting */ }
    if (child.exitCode !== null) throw Error('Fixture daemon exited'); await sleep(200);
  }
  if (!daemonReady) throw Error('Fixture daemon readiness timeout');
  const credential = (await readFile(join(home, 'local-credential'), 'utf8')).trim();
  // The TCP listener precedes completion of built-in plugin bootstrap. Until
  // then WebSocket upgrades return 503; use ws so that status is observable.
  let connected = false;
  while (Date.now() < deadline) {
    client = new DaemonClient({ url: `ws://127.0.0.1:${port}/ws`, clientId: owner, clientType: 'cli', localCredential: () => credential, webSocketFactory: (url, options) => new WebSocket(url, options?.protocols, { headers: options?.headers }), reconnect: { enabled: false } });
    try { await client.connect(); connected = true; break; }
    catch (e) { await client.close(); if (!/503|1006/.test(String(e))) throw e; await sleep(1500); }
  }
  if (!connected) throw Error('Fixture WebSocket readiness timeout');
  await client.installDirectoryPlugin(root, 'flowly');
  check((await rpc('telemetry.status')).forcedOff, 'Fixture telemetry forced off');
  await settings('board-view', { startAgentOnCreate: false });
  await settings('onboarding', { welcomeSeen: true, whatsNewSeen: '1.8.0' });
  await settings('task-summary', { summaryEnabled: false, digestEnabled: false, retroEnabled: false });
  const directory = join(home, 'project'); await mkdir(directory);
  project = await rpc('projects.create', { title: 'Lazy workspace fixture', primaryPath: directory }); state.project = project; await saveState();
  project = await rpc('projects.update', { id: project.id, revision: project.revision, autoReview: { enabled: false, maxRounds: 2 }, memory: false, workflowInsights: false });


  const empty = await rpc('resources.list');
  const before = empty.workspaces.length;
  task = await rpc('tasks.create', { projectId: project.id, operationId: owner, title: 'Lazy workspace card', description: 'Owned first-session fixture', status: 'todo', mode: 'directory' }); state.task = task; await saveState();
  const second = await rpc('tasks.create', { projectId: project.id, operationId: owner + '-2', title: 'Another planned card', status: 'todo', mode: 'directory' });
  check(task.workspaceId === '' && second.workspaceId === '' && !!task.workspacePlan, 'Cards persist a plan without a workspace');
  check((await rpc('resources.list')).workspaces.length === before, 'Two card creations create no native workspaces');
  check((await rpc('tasks.context', { id: task.id })).available, 'Pending card can start a session');
  browser = await launch();
  const serverId = (await client.getDaemonStatus()).serverId;
  for (const width of [1350, 750]) {
    const view = await openPage(width, serverId, contexts.length === 0), p = view.page;
    await openCard(view, task.title);
    await p.getByRole('button', { name: /^(Start session|New session)/ }).first().waitFor();
    check(await p.getByRole('button', { name: /^(Start session|New session)/ }).first().isEnabled(), `${width}px pending card offers session creation`);
    check(!(await pageText(view)).includes('Workspace unavailable'), `${width}px pending card has no missing-workspace warning`);
    await p.getByRole('button', { name: /^(Start session|New session)/ }).first().click();
    await p.getByText('New session', { exact: true }).last().waitFor();
    check((await rpc('resources.list')).workspaces.length === before, `${width}px opening New session creates nothing`);
    await shot(view, join(out, `pending-${width}.png`));
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  }
  const [a,b] = await Promise.all([rpc('tasks.ensure-workspace', { id: task.id }), rpc('tasks.ensure-workspace', { id: task.id })]);
  check(a.workspaceId && a.workspaceId === b.workspaceId, 'Concurrent first-session submissions return one binding');
  task = a; state.task = task; await saveState();
  check((await rpc('resources.list')).workspaces.length === before + 1, 'Exactly one workspace exists after concurrent submit');
  const prep = await rpc('tools.prepare-session', { id: task.id, operationId: owner + '-session' });
  check(prep.workspaceId === task.workspaceId, 'Managed session preparation returns the bound workspace');
  const agent = await client.createAgent({ agentId: prep.agentId, provider: 'claude', model: 'claude-haiku-5-5', modeId: 'bypassPermissions', cwd: task.sourcePath, workspaceId: prep.workspaceId, title: 'Lazy workspace fixture session', idempotencyKey: owner + '-native-session' });
  state.agents = [agent.id]; await saveState();
  check(agent.workspaceId === task.workspaceId, 'Real native session belongs to the lazily created workspace');
  await rpc('tasks.ensure-workspace', { id: task.id });
  check((await rpc('resources.list')).workspaces.length === before + 1, 'Later sessions reuse the workspace');
  await client.reloadPlugin('flowly');
  const after = await rpc('board.read');
  check(after.tasks.find(t => t.id === task.id)?.workspaceId === task.workspaceId && after.tasks.find(t => t.id === second.id)?.workspaceId === '', 'Bindings and pending plans survive plugin reload');
  const pendingDelete = after.tasks.find(t => t.id === second.id);
  await rpc('tasks.delete', { id: second.id, revision: pendingDelete.revision, archive: false, acknowledgeWarnings: false });
  check((await rpc('resources.list')).workspaces.length === before + 1, 'Deleting a pending card does not touch native workspaces');
  check(report.pageErrors.length === 0, 'No UI page errors');
} catch (e) {
  report.failure = String(e.message).replace(/https?:\/\/\S+/g, '[URL]').slice(0, 300); console.log(JSON.stringify({ failure: report.failure })); process.exitCode = 1;
  const page = contexts[0]?.pages()[0];
  if (page) {
    const width = page.viewportSize().width;
    const s = { page, project: 'Lazy workspace fixture', clip: { x: 320, y: 0, width: width - 320, height: 1000 } };
    await shot(s, join(out, 'failure.png')).catch(() => {});
    await writeFile(join(out, 'failure-text.txt'), await pageText(s)).catch(() => {});
  }
}
finally {
  await Promise.allSettled(contexts.map(c => c.close())); await browser?.close().catch(() => {});
  if (webServer) await new Promise(r => webServer.close(r));
  if (client) {
    if (connection) await rpc('connectors.connection-delete', { id: connection.id }).catch(() => { report.cleanup.connectionFailed = true; });
    for (const id of state.agents || []) await client.deleteAgent(id).catch(() => { report.cleanup.agentDeleteFailed = true; });
    if (project) {
      const board = await rpc('board.read').catch(() => null), current = board?.projects.find(p => p.id === project.id);
      if (state.task?.workspaceId) await client.archiveWorkspace(state.task.workspaceId).catch(() => { report.cleanup.workspaceArchiveFailed = true; });
      if (current) await rpc('projects.remove', { id: current.id, revision: current.revision, alsoPaseo: true }).catch(() => { report.cleanup.projectFailed = true; });
    }
    const board = await rpc('board.read').catch(() => null), projects = await client.listProjects().catch(() => null), workspaces = await rpc('resources.list').catch(() => null);
    report.cleanup.boardEmpty = !!board && board.projects.length === 0 && board.tasks.length === 0;
    report.cleanup.nativeEmpty = !!projects && projects.projects.length === 0 && !!workspaces && workspaces.workspaces.length === 0;
    await client.close();
  }
  if (child && child.exitCode === null) { child.kill(); await Promise.race([new Promise(r => child.once('exit', r)), sleep(5000)]); }
  report.cleanup.daemonStopped = !child || child.exitCode !== null || child.signalCode !== null;
  report.cleanup.browserClosed = true;
  if (!report.cleanup.boardEmpty || !report.cleanup.nativeEmpty || !report.cleanup.daemonStopped) process.exitCode = 1;
  // Only this run's freshly recorded home may be removed.
  const marker = JSON.parse(await readFile(join(home, 'owner.json'), 'utf8'));
  if (marker.owner === owner && resolve(marker.home) === home && home.startsWith(resolve('.test-data') + sep) && report.cleanup.daemonStopped) {
    try { await rm(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); report.cleanup.homeRemoved = !existsSync(home); } catch (e) { report.cleanup.homeRemoved = false; report.cleanup.homeRetained = home; report.cleanup.homeRemovalError = e.code; }
  }
  await mkdir(out, { recursive: true }); await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
