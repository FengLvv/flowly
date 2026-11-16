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

const root = resolve('.'), owner = `board-pan-${randomUUID()}`;
const home = resolve('.test-data', owner), out = resolve('docs/verification/board-pan');
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
  return { page, context, project: 'Board pan fixture', w: width, h: 1000, clip: { x: 320, y: 0, width: width - 320, height: 1000 } };
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
  project = await rpc('projects.create', { title: 'Board pan fixture', primaryPath: directory }); state.project = project; await saveState();
  project = await rpc('projects.update', { id: project.id, revision: project.revision, autoReview: { enabled: false, maxRounds: 2 }, memory: false, workflowInsights: false });

  task = await rpc('tasks.create', { projectId: project.id, operationId: owner, title: 'Pan fixture card', description: 'Owned mouse gesture fixture', status: 'todo', mode: 'directory' }); state.task = task; await saveState();
  browser = await launch({ showScrollbars: true });
  const serverId = (await client.getDaemonStatus()).serverId;
  const wide = await openPage(1350, serverId, true), p = wide.page;
  // Playwright's headless Chromium defaults to --hide-scrollbars. Restore
  // native tracks so this run can test the real thumb, not just CSS visibility.
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setScrollbarsHidden', { hidden: false });
  const columns = p.getByTestId('board-columns'); await columns.waitFor();
  await sleep(1500);
  // Locate the real horizontal ScrollView by geometry, not its generated classes.
  const metrics = () => columns.evaluate(root => {
    const el = [root, ...root.querySelectorAll('div')].find(n => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 30 && getComputedStyle(n).overflowX === 'auto');
    if (!el) throw Error('Horizontal ScrollView missing');
    return { x: el.scrollLeft, max: el.scrollWidth - el.clientWidth };
  });
  const scrollbarHidden = () => columns.evaluate(root => {
    const el = [root, ...root.querySelectorAll('div')].find(n => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 30 && getComputedStyle(n).overflowX === 'auto');
    return getComputedStyle(el).scrollbarWidth === 'none' || getComputedStyle(el, '::-webkit-scrollbar').display === 'none';
  });
  const setX = async x => { await columns.evaluate((root, x) => {
    const el = [root, ...root.querySelectorAll('div')].find(n => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 30 && getComputedStyle(n).overflowX === 'auto');
    el.scrollLeft = x;
  }, x); await sleep(100); };
  const frame = await columns.boundingBox(), lane = await p.getByTestId('lane-todo').boundingBox();
  const blank = { x: lane.x + 190, y: frame.y + frame.height - 70 };
  await p.mouse.move(blank.x, blank.y);
  check(await scrollbarHidden(), 'Horizontal scrollbar is hidden by default');
  await p.mouse.move(blank.x, frame.y + frame.height - 5); await sleep(150);
  check(!(await scrollbarHidden()), 'Hover at bottom edge reveals native scrollbar');
  await p.mouse.move(blank.x, blank.y); await sleep(150);
  check(await scrollbarHidden(), 'Leaving bottom edge hides native scrollbar');
  await p.mouse.move(frame.x + 60, frame.y + frame.height - 6); await sleep(150);
  await shot(wide, join(out, 'scrollbar-hover.png'));
  report.scrollbar = await columns.evaluate(root => {
    const el = [root, ...root.querySelectorAll('div')].find(n => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 30 && getComputedStyle(n).overflowX === 'auto');
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, clientHeight: el.clientHeight, offsetHeight: el.offsetHeight, scrollbarWidth: getComputedStyle(el).scrollbarWidth };
  });
  await p.mouse.down({ button: 'left' }); await p.mouse.move(frame.x + 200, frame.y + frame.height - 6, { steps: 12 }); await p.mouse.up({ button: 'left' }); await sleep(150);
  check((await metrics()).x > 50, 'Revealed native scrollbar thumb remains draggable');
  await setX(0);
  const gesture = async (at, dx, button = 'right') => {
    await p.mouse.move(at.x, at.y); await p.mouse.down({ button });
    await p.mouse.move(at.x + dx, at.y, { steps: 12 }); await sleep(150);
    await p.mouse.up({ button }); await sleep(150);
  };
  check((await metrics()).max > 200, 'Expanded board overflows horizontally');
  await gesture(blank, -150); check((await metrics()).x > 100, 'Right drag on lane blank space scrolls right');
  const moved = (await metrics()).x;
  await gesture({ x: blank.x - 30, y: blank.y }, 80); check((await metrics()).x < moved - 50, 'Right drag scrolls left');
  const released = (await metrics()).x; await p.mouse.move(blank.x + 80, blank.y);
  check(Math.abs((await metrics()).x - released) < 2, 'Release stops scrolling');
  await setX(100);
  await p.mouse.move(blank.x, blank.y); await p.mouse.down({ button: 'right' });
  check(await columns.evaluate(n => getComputedStyle(n).cursor === 'grabbing'), 'Active blank gesture shows grabbing cursor');
  await p.mouse.move(blank.x, frame.y + frame.height - 5); await sleep(150);
  check(await scrollbarHidden(), 'Right panning hides scrollbar even over bottom edge');
  await p.mouse.move(frame.x - 10, blank.y, { steps: 10 }); const left = (await metrics()).x;
  await p.mouse.move(blank.x, blank.y); await p.mouse.move(blank.x - 60, blank.y);
  check(Math.abs((await metrics()).x - left) < 2, 'Leaving and reentering cannot resume stale gesture');
  await p.mouse.up({ button: 'right' });
  // Chromium middle-click auto-scroll remains native; pointer unit tests
  // establish that Flowly never takes a middle-button pan.
  for (const button of ['left']) {
    await setX(100); await gesture(blank, -100, button);
    check(Math.abs((await metrics()).x - 100) < 2, `${button} blank drag does not pan`);
  }
  await setX(0);
  const card = p.getByTestId(`card-${task.id}`), cardBox = await card.boundingBox();
  await gesture({ x: cardBox.x + 100, y: cardBox.y + 35 }, -50);
  check((await metrics()).x < 2, 'Right drag starting on a card does not pan');
  // Dismiss an existing card menu without acting on any item.
  await p.mouse.click(frame.x + frame.width - 30, blank.y); await sleep(650);
  await setX(0);
  await p.mouse.click(lane.x + 70, lane.y + 22, { button: 'right' });
  await shot(wide, join(out, 'header-menu.png'));
  await p.getByText('Add task', { exact: true }).waitFor({ state: 'visible', timeout: 6000 });
  check(await p.getByText('Add task', { exact: true }).isVisible(), 'Fresh lane-header right click preserves its context menu');
  await p.mouse.click(frame.x + frame.width - 30, blank.y); await sleep(650);
  await setX(0);
  await p.mouse.move(blank.x, blank.y); await p.mouse.wheel(160, 0); await sleep(300);
  check((await metrics()).x > 100, 'Trackpad/horizontal wheel still scrolls');
  await setX(0);
  // A normal body click must still open the card after blank-area gestures.
  await openCard(wide, task.title); check(await p.getByTestId('task-drawer-motion').isVisible(), 'Card click still opens its sidebar');
  await p.keyboard.press('Escape'); await sleep(350);
  await shot(wide, join(out, 'desktop.png'));
  const compact = await openPage(750, serverId);
  check(await compact.page.getByTestId('board-columns').count() === 0, 'Compact board does not install desktop pan surface');
  check(await compact.page.getByTestId(`card-${task.id}`).count() > 0, 'Compact card remains reachable');
  await shot(compact, join(out, 'compact.png'));
  const board = await rpc('board.read');
  check(board.tasks.length === 1 && board.tasks[0].id === task.id && board.tasks[0].revision === task.revision && board.tasks[0].status === 'todo', 'Gesture sequence never writes card status or position');
  check(report.pageErrors.length === 0, 'No UI page errors');
} catch (e) {
  report.failure = String(e.message).replace(/https?:\/\/\S+/g, '[URL]').slice(0, 300); console.log(JSON.stringify({ failure: report.failure })); process.exitCode = 1;
  const page = contexts[0]?.pages()[0];
  if (page) {
    const width = page.viewportSize().width;
    const s = { page, project: 'Board pan fixture', clip: { x: 320, y: 0, width: width - 320, height: 1000 } };
    await shot(s, join(out, 'failure.png')).catch(() => {});
    await writeFile(join(out, 'failure-text.txt'), await pageText(s)).catch(() => {});
  }
}
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
  // Only this run's freshly recorded home may be removed.
  const marker = JSON.parse(await readFile(join(home, 'owner.json'), 'utf8'));
  if (marker.owner === owner && resolve(marker.home) === home && home.startsWith(resolve('.test-data') + sep) && report.cleanup.daemonStopped) {
    try { await rm(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); report.cleanup.homeRemoved = !existsSync(home); } catch (e) { report.cleanup.homeRemoved = false; report.cleanup.homeRetained = home; report.cleanup.homeRemovalError = e.code; }
  }
  await mkdir(out, { recursive: true }); await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
