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

const root = resolve('.'), owner = `composer-audit-${randomUUID()}`;
const home = resolve('.test-data', owner), out = resolve('docs/verification/composer-experience');
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
  return { page, context, project: 'Composer fixture', w: width, h: 1000, clip: { x: 320, y: 0, width: width - 320, height: 1000 } };
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
  project = await rpc('projects.create', { title: 'Composer fixture', primaryPath: directory }); state.project = project; await saveState();
  project = await rpc('projects.update', { id: project.id, revision: project.revision, autoReview: { enabled: false, maxRounds: 2 }, memory: false, workflowInsights: false });
  task = await rpc('tasks.create', { projectId: project.id, operationId: owner, title: 'Composer fixture task', description: 'Owned composer parity fixture', status: 'todo', mode: 'directory' });
  task = await rpc('tasks.ensure-workspace', { id: task.id });
  const models = await client.listProviderModels('codex', { cwd: directory });
  const model = models.models.find(m => m.id === 'gpt-6.1-sol') || models.models[0];
  const session = { id: randomUUID(), workspaceId: task.workspaceId, directory, title: 'Composer parity fixture' };
  state.sessions.push(session); await saveState();
  await client.createAgent({ agentId: session.id, workspaceId: session.workspaceId, config: { provider: 'codex', model: model.id, cwd: directory, modeId: 'full-access', title: session.title } });
  for (let i=0;i<200;i++) { const a=await client.fetchAgent(session.id); if(a.agent && a.agent.status!=='initializing')break; await sleep(200); }
  const catalog = await client.listCommands(session.id); report.commands = { count: catalog.commands.length, commandCount: catalog.commands.filter(item => item.kind !== 'skill').length, skillCount: catalog.commands.filter(item => item.kind === 'skill').length, error: catalog.error }; 
  const dirs = path => { try { return readdirSync(path, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(path, d.name)); } catch { return []; } };
  const caches = [join(process.env.LOCALAPPDATA, 'npm-cache'), join(process.env.USERPROFILE, '.npm')];
  process.env.PLAYWRIGHT_MODULE ||= caches.flatMap(c => dirs(join(c, '_npx'))).map(p => join(p, 'node_modules', 'playwright')).find(p => existsSync(join(p, 'package.json')));
  const browsers = [join(process.env.LOCALAPPDATA, 'ms-playwright'), join(process.env.USERPROFILE, '.cache/ms-playwright')];
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||= browsers.flatMap(dirs).flatMap(d => ['chrome-win/chrome.exe','chrome-win64/chrome.exe'].map(s => join(d,s))).find(existsSync);
  browser = await launch();
  const serverId = (await client.getDaemonStatus()).serverId;
  const surface = await openPage(1450, serverId, true), p = surface.page;
  await openCard(surface, 'Composer fixture task');
  await p.getByRole('button', {name: new RegExp(session.title)}).first().click();
  await p.getByRole('textbox', {name:'Follow-up instruction',exact:true}).last().waitFor();
  const input = () => p.getByRole('textbox',{name:'Follow-up instruction',exact:true}).last();
  const plus = () => p.locator('button[aria-label="Add attachment"]:not([disabled])').last();
  const addMenu = () => p.getByTestId('composer-add-menu').last();
  const anchor = async label => {
    await plus().click(); await addMenu().waitFor(); await sleep(300);
    const button = await plus().boundingBox(), menu = await addMenu().boundingBox();
    check(menu && button && menu.y+menu.height<=button.y-2 && Math.abs(menu.x-button.x)<2, label+': Add menu anchors above Plus');
    check(menu.x>=0 && menu.x+menu.width<=p.viewportSize().width && menu.y>=0,label+': menu fits viewport');
    const actions=await addMenu().getByRole('button').allTextContents();
    check(actions.join('|')==='Add image|Add issue or PR|Upload file',label+': native action order');
  };
  await anchor('Desktop'); await shot(surface,join(out,'flowly-add-menu.png'));
  await p.keyboard.press('Escape'); await addMenu().waitFor({state:'hidden'});
  check(await input().isVisible(),'Escape closes only the Add menu');
  await plus().click(); await addMenu().getByRole('button',{name:'Add issue or PR',exact:true}).click();
  await p.getByRole('textbox',{name:'Search issues and pull requests',exact:true}).waitFor();
  check(true,'Issue/PR action opens real native-forge search');
  await p.keyboard.press('Escape'); await p.getByRole('textbox',{name:'Search issues and pull requests',exact:true}).waitFor({state:'hidden'});
  await input().fill('/comp');
  await p.getByRole('button',{name:'/compact',exact:true}).waitFor();
  await input().press('Enter');
  check(await input().inputValue()==='/compact ','Enter selects a provider command instead of sending');
  await input().fill('/book'); await p.getByRole('button',{name:'/book-study',exact:true}).waitFor(); await input().press('Tab');
  check(await input().inputValue()==='/book-study ','Tab selects a real skill with native slash syntax');
  await input().fill('/'); await p.getByTestId('composer-command-menu').last().waitFor();
  await input().press('ArrowDown'); await input().press('Escape'); await p.getByTestId('composer-command-menu').last().waitFor({state:'hidden'});
  check(await input().inputValue()==='/','Escape dismisses suggestions without deleting the draft');
  await input().fill('/comp'); await p.getByRole('button',{name:'/compact',exact:true}).waitFor(); await shot(surface,join(out,'flowly-commands.png'));
  await input().fill('');
  check(!(await client.fetchAgent(session.id)).agent.lastUserMessageAt,'Menu and completion selection send no prompt');
  await plus().click();
  const [chooser]=await Promise.all([p.waitForEvent('filechooser'),addMenu().getByRole('button',{name:'Upload file',exact:true}).click()]);
  await chooser.setFiles({name:'picker.txt',mimeType:'text/plain',buffer:Buffer.from('PICKER')});
  await p.getByRole('button',{name:'Remove picker.txt',exact:true}).waitFor();
  check(true,'Generic file picker retains a text file');
  const paste = await input().evaluate(el=>{const data=new DataTransfer();data.items.add(new File(['PASTE'],'pasted.txt',{type:'text/plain'}));const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});el.dispatchEvent(event);return event.defaultPrevented;});
  await p.getByRole('button',{name:'Remove pasted.txt',exact:true}).waitFor();
  check(paste && await p.getByRole('button',{name:'Remove pasted.txt',exact:true}).count()===1,'Pasted non-image file is consumed once');
  const drop = await input().evaluate(el=>{const data=new DataTransfer();data.items.add(new File(['DROP'],'dropped.bin',{type:''}));el.dispatchEvent(new DragEvent('dragover',{dataTransfer:data,bubbles:true,cancelable:true}));const event=new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true});el.dispatchEvent(event);return event.defaultPrevented;});
  await p.getByRole('button',{name:'Remove dropped.bin',exact:true}).waitFor();
  check(drop,'Dropped binary file with empty MIME is retained');
  const imageData='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  await input().evaluate((el,data)=>{const bytes=Uint8Array.from(atob(data),x=>x.charCodeAt(0)), transfer=new DataTransfer();transfer.items.add(new File([bytes],'original.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));},imageData);
  await p.getByRole('button',{name:'Remove original.png',exact:true}).waitFor();
  await input().fill('draft persists with image and files');
  const target={taskId:task.id,agentId:session.id};
  for(let i=0;i<100;i++){const saved=await rpc('composer.attachments.read',target);if(saved.items.length===4)break;await sleep(100);}
  check((await rpc('composer.attachments.read',target)).items.find(x=>x.name==='original.png')?.data===imageData,'Pasted image original bytes persist on daemon');
  await p.getByRole('button',{name:'Back to task',exact:true}).last().click();
  await p.getByRole('button',{name:new RegExp(session.title)}).first().click();
  await p.getByRole('button',{name:'Remove original.png',exact:true}).waitFor();
  check((await input().inputValue())==='draft persists with image and files','Back/reopen retains text and image/file draft');
  const second={id:randomUUID(),workspaceId:session.workspaceId,directory,title:'Other composer fixture'};
  state.sessions.push(second);await saveState();
  await client.createAgent({agentId:second.id,workspaceId:second.workspaceId,config:{provider:'codex',model:model.id,cwd:directory,modeId:'full-access',title:second.title}});
  await p.getByRole('button',{name:'Back to task',exact:true}).last().click();
  await p.getByRole('button',{name:new RegExp(second.title)}).first().click();await input().waitFor();
  check(await p.getByRole('button',{name:'Remove original.png',exact:true}).count()===0,'Other session never receives original session attachments');
  await p.getByRole('button',{name:'Back to task',exact:true}).last().click();
  await p.getByRole('button',{name:new RegExp(session.title)}).first().click();
  await p.getByRole('button',{name:'Remove original.png',exact:true}).waitFor();
  check(await p.getByRole('button',{name:'Remove picker.txt',exact:true}).count()===1,'Switching back restores mixed draft');
  await client.reloadPlugin('flowly');
  await p.reload({waitUntil:'domcontentloaded'});
  await p.getByRole('button',{name:/^New task(?:\s|$)/}).first().waitFor({timeout:45000});
  if(!(await input().isVisible())){await openCard(surface,'Composer fixture task');await p.getByRole('button',{name:new RegExp(session.title)}).first().click();}
  await p.getByRole('button',{name:'Remove original.png',exact:true}).waitFor({timeout:30000});
  const restored=await rpc('composer.attachments.read',target);
  check(restored.items.length===4&&restored.items.find(x=>x.name==='original.png')?.data===imageData,'Plugin reload restores exact image and generic file bytes');
  await shot(surface,join(out,'flowly-restored-draft.png'));
  await p.getByRole('button',{name:'Remove original.png',exact:true}).click();
  for(let i=0;i<100;i++){if((await rpc('composer.attachments.read',target)).items.length===3)break;await sleep(100);}
  check(!(await rpc('composer.attachments.read',target)).items.some(x=>x.name==='original.png'),'Removing restored image persists without removing files');
  await shot(surface,join(out,'flowly-files.png'));
  await input().fill('Read the three attached files. Reply only with their short contents joined by | in this order: picker.txt, pasted.txt, dropped.bin. Do not edit or create anything.');
  await p.getByRole('button',{name:'Send instruction',exact:true}).last().click();
  const until=Date.now()+120000;let finished=false;
  while(Date.now()<until){const a=(await client.fetchAgent(session.id)).agent;if(a.lastUserMessageAt && a.status==='idle'){finished=true;break;}await sleep(500);}
  check(finished,'Attached-file message reaches the real provider and finishes');
  const timeline=await client.fetchAgentTimeline(session.id);const encoded=JSON.stringify(timeline);
  check(encoded.includes('PICKER|PASTE|DROP'),'Provider reads exact picker/paste/drop bytes');
  report.messageEvidence={filenames:['picker.txt','pasted.txt','dropped.bin'],expected:'PICKER|PASTE|DROP',seen:encoded.includes('PICKER|PASTE|DROP')};
  check(await p.getByRole('button',{name:'Remove picker.txt',exact:true}).count()===0,'Successful send clears only submitted attachments');
  await p.setViewportSize({width:750,height:1000});surface.w=750;surface.clip={x:320,y:0,width:430,height:1000};await sleep(700);
  if(!(await input().isVisible())){const row=p.getByRole('button',{name:new RegExp(session.title)}).first();if(!(await row.isVisible()))await openCard(surface,'Composer fixture task');await row.click();}
  await input().waitFor();await anchor('Compact');await shot(surface,join(out,'compact-add-menu.png'));
  await p.keyboard.press('Escape'); await addMenu().waitFor({state:'hidden'});
  await input().fill('/comp');await p.getByRole('button',{name:'/compact',exact:true}).waitFor();await input().press('Tab');
  check(await input().inputValue()==='/compact ','Compact command selection preserves focus and draft');
  await input().fill('');
  const before=(await client.fetchAgent(session.id)).agent.lastUserMessageAt;
  await input().fill('/clear');await p.getByRole('button',{name:'/clear',exact:true}).waitFor();await p.getByRole('button',{name:'/clear',exact:true}).click();
  await p.locator('[data-composer-input]').last().waitFor({timeout:30000});
  check((await p.locator('[data-composer-input]').last().inputValue()).trim()==='/clear','Host-only command opens the exact native composer for review');
  await p.locator('[data-composer-input]').last().fill('');
  const after=(await client.fetchAgent(session.id)).agent;
  check(after.lastUserMessageAt===before && !after.archivedAt,'Host-only completion neither sends nor archives automatically');
  check(report.pageErrors.length===0,'No page errors');
} catch (e) {
  report.failure = String(e.message).replace(/https?:\/\/\S+/g, '[URL]').slice(0, 300); console.log(JSON.stringify({ failure: report.failure })); process.exitCode = 1;
  const page = contexts[0]?.pages().at(-1);
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
  await mkdir(out, { recursive: true }); await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({checks:report.checks,cleanup:report.cleanup,pageErrors:report.pageErrors,failure:report.failure}));
}
