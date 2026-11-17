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

const root = resolve('.'), owner = `runtime-view-${randomUUID()}`;
const home = resolve('.test-data', owner), out = resolve('docs/verification/runtime-view');
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
  return { page, context, project: 'Runtime', w: width, h: 1000, clip: { x: 320, y: 0, width: width - 320, height: 1000 } };
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

  state.sessions = []; state.nativeProjects = [];
  const directory = join(home, 'project'); await mkdir(directory);
  project = await rpc('projects.create', { title: 'Runtime fixture', primaryPath: directory }); state.project = project; await saveState();
  project = await rpc('projects.update', { id: project.id, revision: project.revision, autoReview: { enabled: false, maxRounds: 2 }, memory: false, workflowInsights: false });
  task = await rpc('tasks.create', { projectId: project.id, operationId: owner, title: 'Bound task fixture', description: 'Owned runtime fixture', status: 'todo', mode: 'directory' });
  task = await rpc('tasks.ensure-workspace', { id: task.id });
  const scopes = [{ workspaceId: task.workspaceId, directory, title: 'Runtime bound one' }, { workspaceId: task.workspaceId, directory, title: 'Runtime bound two' }];
  for (const n of [2,3]) {
    const path = join(home, `native-${n}`); await mkdir(path);
    const added = await client.addProject(path); const native = added.project || added.payload?.project;
    if (!native?.projectId) throw Error('Fixture native project missing');
    state.nativeProjects.push(native.projectId); await saveState();
    const created = await client.createWorkspace({ source: { kind: 'directory', path, projectId: native.projectId }, title: `Runtime native ${n}` });
    scopes.push({ workspaceId: created.workspace.id, directory: path, title: `Runtime unbound ${n}` });
  }
  const models = await client.listProviderModels('codex', { cwd: directory });
  const model = models.models.find(m => m.id === 'gpt-6.1-sol' && m.isSelectable !== false) || models.models.find(m => m.isSelectable !== false);
  if (!model) throw Error('Fixture model unavailable');
  for (const scope of scopes) {
    scope.id = randomUUID(); state.sessions.push(scope); await saveState();
    await client.createAgent({ agentId: scope.id, workspaceId: scope.workspaceId, config: { provider: 'codex', model: model.id, cwd: scope.directory, modeId: 'full-access', title: scope.title } });
  }
  const ready = Date.now() + 60000;
  while (Date.now() < ready) { const states = await Promise.all(scopes.map(s => client.fetchAgent(s.id))); if (states.every(s => s.agent && s.agent.status !== 'initializing')) break; await sleep(250); }
  check((await rpc('board.read')).tasks.length === 1, 'Four native sessions across three projects create no synthetic cards');
  const dirs = path => { try { return readdirSync(path, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(path, d.name)); } catch { return []; } };
  const caches = [join(process.env.LOCALAPPDATA, 'npm-cache'), join(process.env.USERPROFILE, '.npm')];
  process.env.PLAYWRIGHT_MODULE ||= caches.flatMap(c => dirs(join(c, '_npx'))).map(p => join(p, 'node_modules', 'playwright')).find(p => existsSync(join(p, 'package.json')));
  const browsers = [join(process.env.LOCALAPPDATA, 'ms-playwright'), join(process.env.USERPROFILE, '.cache/ms-playwright')];
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||= browsers.flatMap(dirs).flatMap(d => ['chrome-win/chrome.exe','chrome-win64/chrome.exe'].map(s => join(d,s))).find(existsSync);
  browser = await launch({ showScrollbars: true });
  const serverId = (await client.getDaemonStatus()).serverId;
  const wide = await openPage(1350, serverId, true), p = wide.page;
  await p.getByTestId('runtime-tab').click();
  const columns = p.getByTestId('runtime-pan'); await columns.waitFor(); await sleep(1500);
  const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setScrollbarsHidden', { hidden: false });
  const metric = () => columns.evaluate(root => { const el = [root,...root.querySelectorAll('div')].find(n => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 20 && getComputedStyle(n).overflowX === 'auto'); if (!el) throw Error('Runtime scroller missing'); return { x: el.scrollLeft, max: el.scrollWidth-el.clientWidth }; });
  const setX = async x => { await columns.evaluate((root,x) => { const el=[root,...root.querySelectorAll('div')].find(n=>n.clientWidth>0 && n.scrollWidth>n.clientWidth+20 && getComputedStyle(n).overflowX==='auto');el.scrollLeft=x; },x);await sleep(250); };
  const hidden = () => columns.evaluate(root => { const el=[root,...root.querySelectorAll('div')].find(n=>n.clientWidth>0 && n.scrollWidth>n.clientWidth+20 && getComputedStyle(n).overflowX==='auto');return getComputedStyle(el).scrollbarWidth==='none'||getComputedStyle(el,'::-webkit-scrollbar').display==='none'; });
  const frame=await columns.boundingBox(), blank={x:frame.x+140,y:frame.y+frame.height-70};
  await p.mouse.move(blank.x,blank.y);check(await hidden(),'Runtime bottom scrollbar hidden by default');
  await p.mouse.move(blank.x,frame.y+frame.height-5);await sleep(150);check(!(await hidden()),'Runtime bottom hover reveals native scrollbar');
  await p.mouse.down({button:'left'});await p.mouse.move(blank.x+80,frame.y+frame.height-5,{steps:10});await p.mouse.up({button:'left'});await sleep(150);check((await metric()).x>10,'Runtime native scrollbar remains draggable');
  await setX(0);await p.mouse.move(blank.x,blank.y);await p.mouse.down({button:'right'});await p.mouse.move(blank.x-110,blank.y,{steps:10});await p.mouse.up({button:'right'});await sleep(200);check((await metric()).x>70,'Runtime blank right drag pans');
  await p.mouse.move(blank.x,blank.y);check(await hidden(),'Scrollbar hides after blank pan');
  await setX((await metric()).max);
  for (const s of scopes) await p.getByTestId(`runtime-session-${s.id}`).waitFor({state:'visible'});
  check(true,'Every bound and unbound conversation appears separately, including two in one workspace');
  await shot(wide,join(out,'desktop.png'));
  const row=p.getByTestId(`runtime-session-${scopes[2].id}`), box=await row.boundingBox(), beforePan=(await metric()).x;
  await p.mouse.move(box.x+60,box.y+30);await p.mouse.down({button:'right'});await p.mouse.move(box.x+30,box.y+30,{steps:5});await p.mouse.up({button:'right'});await sleep(200);
  check(Math.abs((await metric()).x-beforePan)<2,'Conversation card right drag does not pan');
  await p.getByText('Open conversation',{exact:true}).waitFor();check(true,'Conversation right click keeps its own menu');
  await p.mouse.click(frame.x+frame.width-30,blank.y);await sleep(400);
  await row.getByRole('button').first().click();
  const pane=p.getByTestId('runtime-session-pane');await pane.waitFor();await p.getByTestId('session-composer-controls').waitFor();
  check(await p.getByTestId('task-drawer-motion').count()===0,'Unbound conversation opens original chat directly without task overview');
  check(await p.getByRole('button',{name:'Back to Runtime',exact:true}).isVisible(),'Original Flowly conversation navigation is reused');
  const input=pane.locator('textarea').last();await input.fill('runtime fixture draft');await sleep(800);
  await shot(wide,join(out,'direct-chat.png'));
  await p.getByRole('button',{name:'Back to Runtime',exact:true}).click();await pane.waitFor({state:'detached'});
  check(Math.abs((await metric()).x-beforePan)<3,'Back preserves horizontal Runtime position');
  await row.getByRole('button').first().click();await p.getByTestId('session-composer-controls').waitFor();await sleep(800);
  check(await pane.locator('textarea').last().inputValue()==='runtime fixture draft','Unbound draft restores after close/reopen');
  await pane.locator('textarea').last().fill('');await sleep(600);await p.getByRole('button',{name:'Back to Runtime',exact:true}).click();await pane.waitFor({state:'detached'});
  await p.getByTestId(`runtime-session-${scopes[0].id}`).getByRole('button').first().click();await p.getByTestId('session-composer-controls').waitFor();
  check(await p.getByTestId('task-drawer-motion').count()===0,'Bound conversation also bypasses task overview');
  await p.getByRole('button',{name:'Back to Runtime',exact:true}).click();await pane.waitFor({state:'detached'});
  const compact=await openPage(750,serverId);const cp=compact.page;
  await cp.getByRole('button',{name:/^Project:/}).click();await cp.getByTestId('runtime-chooser').click();await cp.getByTestId('runtime-group-idle').click();
  await cp.getByTestId(`runtime-session-${scopes[2].id}`).getByRole('button').first().click();await cp.getByTestId('session-composer-controls').waitFor();
  check(await cp.getByTestId('runtime-session-pane').isVisible(),'Compact Runtime opens the original conversation page');
  await shot(compact,join(out,'compact-chat.png'));await cp.getByRole('button',{name:'Back to Runtime',exact:true}).click();await cp.getByTestId('runtime-session-pane').waitFor({state:'detached'});
  check(await cp.getByTestId(`runtime-session-${scopes[2].id}`).isVisible(),'Compact Back preserves selected group');
  await shot(compact,join(out,'compact-runtime.png'));
  const after=await rpc('board.read');check(after.tasks.length===1&&after.tasks[0].status==='todo','Runtime operations preserve card business status and native bindings');
  check((await Promise.all(scopes.map(s=>client.fetchAgent(s.id)))).every(a=>!a.agent.lastUserMessageAt),'Opening and draft checks send no prompt');
  check(report.pageErrors.length===0,'No UI page errors');
} catch (e) {
  report.failure = String(e.message).replace(/https?:\/\/\S+/g, '[URL]').slice(0, 300); console.log(JSON.stringify({ failure: report.failure })); process.exitCode = 1;
  const page = contexts[0]?.pages()[0];
  if (page) {
    const width = page.viewportSize().width;
    const s = { page, project: 'Runtime', clip: { x: 320, y: 0, width: width - 320, height: 1000 } };
    await shot(s, join(out, 'failure.png')).catch(() => {});
    await writeFile(join(out, 'failure-text.txt'), await pageText(s)).catch(() => {});
  }
}
finally {
  await Promise.allSettled(contexts.map(c => c.close())); await browser?.close().catch(() => {});
  if (webServer) await new Promise(r => webServer.close(r));
  if (client) {
    for (const s of state.sessions || []) await client.deleteAgent(s.id).catch(() => { report.cleanup.sessionFailed = true; });
    for (const id of state.nativeProjects || []) await client.removeProject(id).catch(() => { report.cleanup.nativeFailed = true; });
    const ownedNative = await client.listProjects().catch(() => null);
    for (const item of ownedNative?.projects || []) {
      if (state.nativeProjects?.includes(item.id || item.projectId) || project?.paseoProjectId === (item.id || item.projectId)) continue;
      if (JSON.stringify(item).includes(home.replaceAll('\\','/')) || JSON.stringify(item).includes(home.replaceAll('\\','\\\\'))) await client.removeProject(item.id || item.projectId).catch(() => {});
    }
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
  // Only this run's freshly recorded home may be removed.
  const marker = JSON.parse(await readFile(join(home, 'owner.json'), 'utf8'));
  if (marker.owner === owner && resolve(marker.home) === home && home.startsWith(resolve('.test-data') + sep) && report.cleanup.daemonStopped) {
    try { await rm(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); report.cleanup.homeRemoved = !existsSync(home); } catch (e) { report.cleanup.homeRemoved = false; report.cleanup.homeRetained = home; report.cleanup.homeRemovalError = e.code; }
  }
  await mkdir(out, { recursive: true }); await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
