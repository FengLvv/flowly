// Owned fixture host and synthetic TAPD data only. Never operates native user windows.
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, openSync, closeSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, sep, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer, connect } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { launch, shot, pageText, openCard } from '../promo/shot-lib.mjs';

const root = resolve('.'), owner = `tapd-mine-${randomUUID()}`;
const home = resolve('.test-data', owner), out = resolve(process.env.TAPD_UI_EVIDENCE_DIR || 'docs/verification/tapd-mine');
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
const mine = p => p.getByRole('button', { name: 'Search in: My to-dos', exact: true });
const all = p => p.getByRole('button', { name: 'Search in: All work items', exact: true });
// The installed desktop renderer drops accessibilityState.selected on buttons.
// Check the actual selected border together with the result ownership below.
const selected = locator => locator.evaluate(el => { const s = getComputedStyle(el); return s.borderTopWidth !== '0px' && s.borderTopColor !== 'transparent' && s.borderTopColor !== 'rgba(0, 0, 0, 0)'; });
const choices = p => p.getByRole('button', { name: /^(My|Other) (story|bug|task) item$/ });
async function ready(p, count) {
  await p.waitForFunction(n => [...document.querySelectorAll('button[aria-label]')].filter(el => /^(My|Other) (story|bug|task) item$/.test(el.getAttribute('aria-label'))).length === n, count, { timeout: 30000 });
}
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
  return { page, context, project: 'TAPD mine fixture', w: width, h: 1000, clip: { x: 320, y: 0, width: width - 320, height: 1000 } };
}
async function newPicker(p) { await p.getByRole('button', { name: /^New task(?:\s|$)/ }).first().click(); await p.getByRole('button', { name: 'From TAPD', exact: true }).click(); await ready(p, 3); }

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
  const bin = join(home, 'bin'), runtime = join(bin, 'node_modules/mcporter/dist'); await mkdir(runtime, { recursive: true });
  await writeFile(join(bin, 'node_modules/mcporter/package.json'), '{"type":"module"}');
  await writeFile(join(home, 'mode'), 'normal');
  await writeFile(join(runtime, 'index.js'), `
import {readFileSync} from 'node:fs';
const modeFile=${JSON.stringify(join(home, 'mode'))};
const kinds={stories_get:'story',bugs_get:'bug',tasks_get:'task',user_todo_stories_get:'story',user_todo_bugs_get:'bug',user_todo_tasks_get:'task'};
const row=(kind,other=false)=>({id:other?'1000000042000000124':'1000000042000000123',workspace_id:'42',name:(other?'Other ':'My ')+kind+' item',title:(other?'Other ':'My ')+kind+' item',owner:other?'bob':'alice',status:'open',created:'2026-11-16 10:00:00',modified:'2026-11-16 10:00:00',description:'Synthetic fixture body'});
export async function createRuntime(){return {close:async()=>{},callTool:async(server,method,{args})=>{
if(server!=='tapd'||method!=='proxy_execute_tool')throw Error('Invalid bridge');
const {tool_name:tool,tool_args:a}=args, kind=kinds[tool], mode=readFileSync(modeFile,'utf8');
if(tool==='user_participant_workspace_get')return [{id:'42',name:'TAPD fixture'}];
if(tool==='tapd_id_get')return [{ShardIdMap:{workspace_id:'42',type:a.type,short_id:String(a.short_id),long_id:a.short_id===124?'1000000042000000124':'1000000042000000123'}}];
if(tool==='comments_get')return [];
if(!kind||a.workspace_id!=='42')throw Error('Invalid read');
if(tool.startsWith('user_todo_')){if(mode==='fail'&&kind==='bug')throw Error('Fixture unavailable');if(mode==='empty')return [];return [row(kind),{...row(kind),workspace_id:'43'}];}
if(a.id)return [row(kind,a.id.endsWith('124'))];
const title=a.name||a.title||'';return [row(kind),row(kind,true)].filter(r=>r.name.toLowerCase().includes(title.toLowerCase()));
}};}
`);
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
  project = await rpc('projects.create', { title: 'TAPD mine fixture', primaryPath: directory }); state.project = project; await saveState();
  project = await rpc('projects.update', { id: project.id, revision: project.revision, autoReview: { enabled: false, maxRounds: 2 }, memory: false, workflowInsights: false });
  connection = await rpc('connectors.connection-save', { provider: 'tapd-internal', name: 'TAPD fixture', baseUrl: 'https://tapd.woa.com/tapd_fe/42' }); state.connectionId = connection.id; await saveState();
  task = await rpc('tasks.create', { projectId: project.id, operationId: owner, title: 'TAPD mine card', description: 'Synthetic fixture', status: 'todo', mode: 'directory' }); state.task = task; await saveState();
  const query = (text = '', extra = {}) => rpc('connectors.search', { connectionId: connection.id, query: text, ...extra });
  check((await query()).results.length === 3, 'RPC omitted all defaults to project-scoped my to-dos');
  check((await query('', { all: true })).results.length === 6, 'RPC All returns both owners');
  check((await query('other')).results.length === 0 && (await query('other', { all: true })).results.length === 3, 'RPC title search respects scope');
  check((await query('story-124')).results[0]?.summary === 'Other story item', 'RPC exact reference can resolve another owner');
  // Use the shared screenshot module's portable discovery, including Windows caches.
  const dirs = p => { try { return readdirSync(p).map(n => join(p, n)); } catch { return []; } };
  const cache = [process.env.npm_config_cache, process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'npm-cache')].filter(Boolean);
  process.env.PLAYWRIGHT_MODULE ||= cache.flatMap(p => dirs(join(p, '_npx'))).map(p => join(p, 'node_modules/playwright')).find(existsSync);
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= join(process.env.LOCALAPPDATA, 'ms-playwright');
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||= dirs(process.env.PLAYWRIGHT_BROWSERS_PATH).filter(p => /chromium-\d+$/.test(p))
    .flatMap(p => ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome'].map(x => join(p, x))).find(existsSync);
  browser = await launch();
  const serverId = (await client.getDaemonStatus()).serverId;
  const wide = await openPage(1700, serverId, true), p = wide.page;
  await newPicker(p);
  check((await choices(p).allTextContents()).every(t => /^My (story|bug|task) item$/.test(t.trim())), 'Desktop picker rows contain only titles');
  await shot(wide, join(out, 'wide-default.png'));
  check(await selected(mine(p)), 'New task defaults to My to-dos');
  await all(p).click(); await ready(p, 6); check(await selected(all(p)), 'New task switches to All');
  await mine(p).click(); await ready(p, 3); check((await choices(p).allTextContents()).every(t => !t.includes('Other')), 'Switching back removes other owners');
  await shot(wide, join(out, 'wide-mine.png'));
  await p.getByRole('textbox', { name: 'Search TAPD', exact: true }).fill('other');
  await p.getByText('No matching to-dos for your TAPD account in this project.', { exact: true }).waitFor();
  await all(p).click(); await ready(p, 3); check((await choices(p).allTextContents()).every(t => t.includes('Other')), 'Title filter can broaden explicitly');
  await p.getByRole('textbox', { name: 'Search TAPD', exact: true }).fill('story-124'); await ready(p, 1);
  check(await mine(p).count() === 0, 'Exact lookup hides the scope control');
  await choices(p).click(); check(await p.getByRole('textbox', { name: 'Title', exact: true }).inputValue() === 'Other story item', 'Explicit other-owner import still prefills title');
  check(await p.getByRole('button', { name: 'Remove Other story item', exact: true }).count() === 1 && await p.getByText(/^tapd:/).count() === 0, 'Selected chip shows title without ID');
  await p.getByRole('button', { name: 'Cancel', exact: true }).click();
  await newPicker(p); check(await selected(mine(p)), 'Reopening resets the picker to My to-dos');
  await p.getByRole('button', { name: 'Cancel', exact: true }).click();
  // Expire the cache through distinct title queries; the fresh empty scope must not broaden.
  await writeFile(join(home, 'mode'), 'empty'); await newPicker(p);
  await p.getByRole('textbox', { name: 'Search TAPD', exact: true }).fill('empty');
  await p.getByText('No matching to-dos for your TAPD account in this project.', { exact: true }).waitFor();
  check(await choices(p).count() === 0, 'Empty todos remain empty');
  await writeFile(join(home, 'mode'), 'fail');
  await p.getByRole('textbox', { name: 'Search TAPD', exact: true }).fill('retry');
  await p.getByRole('button', { name: 'Retry', exact: true }).waitFor();
  check(await choices(p).count() === 0, 'Todo endpoint failure shows Retry without all/partial results');
  await writeFile(join(home, 'mode'), 'normal');
  // ConnectorService enforces a five-second minimum backoff after unavailable.
  await sleep(5100);
  await p.getByRole('button', { name: 'Retry', exact: true }).click();
  await p.getByText('No matching to-dos for your TAPD account in this project.', { exact: true }).waitFor();
  check(await choices(p).count() === 0, 'Retry recovers after the connector backoff');
  await p.getByRole('button', { name: 'Cancel', exact: true }).click();
  const compact = await openPage(750, serverId); await newPicker(compact.page);
  check(await selected(mine(compact.page)) && await bound(mine(compact.page)) && await bound(all(compact.page)), '750px My/All controls selected and inside viewport');
  check((await choices(compact.page).allTextContents()).every(t => /^My (story|bug|task) item$/.test(t.trim())), 'Compact picker rows contain only titles');
  await all(compact.page).click(); await ready(compact.page, 6); await shot(compact, join(out, 'compact-all.png'));
  await compact.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await openCard(wide, task.title);
  await p.getByRole('button', { name: 'Add an artifact: a file, link, or an item from a connected service', exact: true }).click();
  await p.getByText('TAPD work item…', { exact: true }).click(); await ready(p, 3);
  check(await selected(mine(p)), 'Artifacts picker defaults to My to-dos');
  await all(p).click(); await ready(p, 6); await mine(p).click(); await ready(p, 3);
  check((await choices(p).allTextContents()).every(t => !t.includes('Other')), 'Artifacts picker switches both ways');
  await writeFile(join(out, 'page-text.txt'), await pageText(wide));
  await p.getByRole('button', { name: 'My story item', exact: true }).click();
  await p.getByRole('textbox', { name: 'Search TAPD', exact: true }).waitFor({ state: 'hidden', timeout: 30000 });
  const board = await rpc('board.read');
  check(board.artifacts.some(a => a.taskId === task.id && a.external?.remoteId === '1000000042000000123'), 'Chosen own item persists as an input');
  const artifactRow = p.getByRole('button', { name: 'Input: My story item, Added by you', exact: true }); await artifactRow.waitFor();
  check(!(await artifactRow.textContent()).includes('tapd:') && !(await artifactRow.textContent()).includes('open'), 'Existing-format artifact displays title only without rewriting its reference');
  await client.reloadPlugin('flowly');
  check((await query()).results.length === 3 && (await rpc('board.read')).artifacts.length === 1, 'Filter and input survive fixture reload');
  check(report.pageErrors.length === 0, 'No UI page errors');
} catch (e) { report.failure = String(e.message).replace(/https?:\/\/\S+/g, '[URL]').slice(0, 300); console.log(JSON.stringify({ failure: report.failure })); process.exitCode = 1; }
finally {
  await Promise.allSettled(contexts.map(c => c.close())); await browser?.close().catch(() => {});
  if (webServer) await new Promise(r => webServer.close(r));
  if (client) {
    if (connection) await rpc('connectors.connection-delete', { id: connection.id }).catch(() => { report.cleanup.connectionFailed = true; });
    if (project) {
      const board = await rpc('board.read').catch(() => null), current = board?.projects.find(p => p.id === project.id);
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
  // Directory deletion was rejected by automatic approval in this session.
  // Keep the owned home recorded rather than retrying through another mechanism.
  report.cleanup.homeRemoved = false;
  report.cleanup.homeRetained = home;
  await mkdir(out, { recursive: true }); await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
