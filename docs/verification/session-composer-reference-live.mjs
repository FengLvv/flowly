// Only owns the preallocated test session in this card's existing workspace.
// No model prompt is sent. Native user windows and canvas are never touched.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { launch, shot, pageText, openCard } from '../promo/shot-lib.mjs';

const referenceOnly = process.env.FLOWLY_COMPOSER_REFERENCE === '1';
const orderOnly = process.env.FLOWLY_ORDER_ONLY === '1' || referenceOnly;
const out = resolve(referenceOnly ? 'docs/verification/session-composer-reference' : orderOnly ? 'docs/verification/session-feature-order' : 'docs/verification/session-feature-icons'), temp = resolve('.test-data/session-parity');
const sessionId = randomUUID(), taskId = '37e6fa0a-d586-4447-90dd-855711a5cbb3', workspaceId = 'wks_d1504bb406d8b105';
const title = `Feature icons fixture ${sessionId.slice(0, 8)}`;
const report = { sessionId, workspaceId, taskId, checks: [], cleanup: {}, pageErrors: [] };
let client, browser, webServer, lastSurface;
const contexts = [];
const check = (value, label) => { report.checks.push({ pass: !!value, label }); console.log(JSON.stringify({ pass: !!value, label })); if (!value) throw Error(label); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const snapshot = async () => (await client.fetchAgent(sessionId))?.agent;
const rpc = (name, input) => client.invokePluginRpc('flowly', name, input);
const configure = change => rpc('sessions.configure', { taskId, agentId: sessionId, ...change });
async function waitFor(predicate) { for (let i = 0; i < 100; i++) { const a = await snapshot(); if (a && predicate(a)) return a; await sleep(200); } throw Error('Snapshot convergence timeout'); }

try {
  await mkdir(out, { recursive: true }); await mkdir(temp, { recursive: true });
  await writeFile(join(out, 'owned-session.json'), JSON.stringify({ sessionId, workspaceId, taskId }));
  const { openLocalDaemon } = await import('../../server/local-daemon.ts');
  client = await openLocalDaemon(join(homedir(), '.paseo'), 'flowly-parity-verification', [], '');
  const models = await client.listProviderModels('codex', { cwd: process.cwd() });
  const choices = models.models.filter(m => m.isSelectable !== false);
  const first = choices.find(m => m.id === 'gpt-6.1-sol') || choices[0], second = choices.find(m => m.id !== first.id);
  check(!!second, 'Two selectable Codex models discovered');
  await client.createAgent({ agentId: sessionId, workspaceId, config: { provider: 'codex', model: first.id, cwd: process.cwd(), modeId: 'full-access', title, ...(referenceOnly ? { thinkingOptionId: 'xhigh' } : {}) }, labels: { 'flowly-parity-fixture': sessionId } });
  const before = await waitFor(a => a.status !== 'initializing');
  check(before.workspaceId === workspaceId && !before.lastUserMessageAt, 'Fixture initialized in card workspace without sending a prompt');
  if (!orderOnly) {
  await configure({ modelId: second.id });
  await waitFor(a => a.model === second.id);
  check(true, 'Installed Flowly model RPC changes the real existing session');
  report.features = before.features?.map(f => ({ id: f.id, type: f.type, label: f.label }));
  for (const f of before.features || []) {
    const value = f.type === 'toggle' ? !f.value : f.options.find(o => o.id !== f.value)?.id;
    if (value === undefined) continue;
    await configure({ feature: { id: f.id, value } });
    await waitFor(a => a.features?.some(x => x.id === f.id && x.value === value));
    check(true, `Real provider feature ${f.id} changes and reads back`);
    if (f.value !== null) await configure({ feature: { id: f.id, value: f.value } });
  }
  let refused = false;
  try { await configure({ feature: { id: 'flowly-invalid-fixture-feature', value: true } }); } catch { refused = true; }
  check(refused, 'Unknown feature rejected by installed RPC');
  refused = false;
  try { await rpc('sessions.configure', { taskId: 'missing-fixture-card', agentId: sessionId, modelId: first.id }); } catch { refused = true; }
  check(refused, 'Missing task rejected without changing the fixture');
  await configure({ modelId: first.id });
  const after = await waitFor(a => a.model === first.id);
  check(after.id === sessionId && after.workspaceId === workspaceId && !after.lastUserMessageAt, 'Identity, ownership and no-message state preserved');

  }

  // Isolated browser context using installed renderer, never the user's two native windows.
  const webRoot = join(process.env.LOCALAPPDATA, 'Programs/Paseo/resources/app-dist');
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  webServer = createServer(async (req, res) => {
    try {
      let file = resolve(webRoot, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!file.startsWith(webRoot + sep) && file !== webRoot) { res.writeHead(403); res.end(); return; }
      if (file === webRoot || !existsSync(file)) file = join(webRoot, 'index.html');
      res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => webServer.listen(0, '127.0.0.1', r));
  const webUrl = `http://127.0.0.1:${webServer.address().port}`;
  browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1550, height: 1000 }, locale: 'en-US', colorScheme: referenceOnly ? 'dark' : 'light' }); contexts.push(context);
  await context.grantPermissions(['local-network-access'], { origin: webUrl });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => report.pageErrors.push(e.name));
  lastSurface = { page, context, project: 'Flowly', w: 1550, h: 1000, clip: { x: 320, y: 0, width: 1230, height: 1000 } };
  const offer = await client.getDaemonPairingOffer();
  await page.goto(webUrl + '/' + new URL(offer.url).hash, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByRole('button', { name: /^(Connect|连接)$/ }).click({ timeout: 45000 });
  await page.getByTestId('plugin-sidebar-flowly-board').waitFor({ state: 'visible', timeout: 45000 });
  const serverId = (await client.getDaemonStatus()).serverId;
  await page.goto(`${webUrl}/h/${serverId}/plugin/flowly/surface/board`, { waitUntil: 'commit', timeout: 45000 });
  await page.getByRole('button', { name: /^New task(?:\s|$)/ }).first().waitFor({ timeout: 45000 });
  // Open this card directly through its real board button.
  const s = { page, context, project: 'Flowly', w: 1550, h: 1000, clip: { x: 320, y: 0, width: 1230, height: 1000 } };
  lastSurface = s;
  const projectButton = page.getByRole('tab', { name: 'Project Flowly', exact: true });
  await projectButton.click({ timeout: 30000 });
  await page.getByRole('button', { name: /^Open task 聊天功能对齐paseo\./ }).waitFor({ timeout: 30000 });
  await openCard(s, '聊天功能对齐paseo');
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
  const modelChip = () => page.locator('button[aria-label^="Model: "]:not([disabled])').last();
  if (orderOnly) {
    const capture = async file => {
      const b = await page.locator('[data-testid="task-drawer-motion"]:visible').last().boundingBox();
      if (!b || b.x < 280) throw Error('Session pane privacy boundary unavailable');
      s.clip = { x: Math.ceil(b.x), y: Math.ceil(b.y), width: Math.floor(Math.min(b.width, s.w - Math.ceil(b.x))), height: Math.floor(Math.min(b.height, 1000 - Math.ceil(b.y))) };
      await shot(s, join(out, file));
    };
    const reopen = async () => {
      await sleep(600);
      if (await modelChip().isVisible()) return;
      const row = page.getByRole('button', { name: new RegExp(title) }).first();
      if (!(await row.isVisible())) await openCard(s, '聊天功能对齐paseo');
      await row.click();
    };
    const order = async label => {
      await modelChip().waitFor({ state: 'visible' });
      if (first.thinkingOptions?.length) await page.getByRole('button', { name: /^Reasoning:/ }).last().waitFor();
      await sleep(300);
      const frame = await page.getByTestId('session-composer').last().boundingBox();
      const controls = [page.getByRole('button', { name: 'Attach images', exact: true }).last(), modelChip(), page.getByRole('button', { name: /^Reasoning:/ }).last(), page.getByRole('button', { name: /^Permissions:/ }).last(), page.getByRole('button', { name: /^Speed:/ }).last(), page.getByRole('switch', { name: /^Plan:/ }).last()];
      const boxes = await Promise.all(controls.map(c => c.boundingBox()));
      check(frame && boxes.every(b => b && b.x >= frame.x && b.x + b.width <= frame.x + frame.width + 1 && b.y >= frame.y && b.y + b.height <= frame.y + frame.height), label + ': all controls inside composer frame');
      check(boxes.every((b, i) => !i || b.y > boxes[i-1].y + 2 || (Math.abs(b.y - boxes[i-1].y) <= 2 && b.x >= boxes[i-1].x + boxes[i-1].width - 1)), label + ': Add, model, reasoning, permissions, Speed, Plan in reading order');
      const permissions = boxes[3], speed = boxes[4], plan = boxes[5];
      check(Math.abs(speed.y - permissions.y) > 2 ? speed.x <= boxes[1].x + 1 : speed.x - permissions.x - permissions.width <= 8, label + ': Speed naturally follows permissions without elastic gap');
      check(Math.abs(plan.y - speed.y) > 2 ? plan.x <= boxes[1].x + 1 : plan.x - speed.x - speed.width <= 8, label + ': Plan naturally follows Speed without elastic gap');
      const send = await page.getByRole('button', { name: 'Send instruction', exact: true }).last().boundingBox();
      check(send && send.x >= frame.x && send.x + send.width <= frame.x + frame.width && send.y + send.height <= frame.y + frame.height, label + ': Send is inside the same border');
    };
    await order('Dark desktop'); await capture('dark-desktop.png');
    const input = page.getByRole('textbox', { name: 'Follow-up instruction', exact: true }).last();
    await input.fill('Composer reference draft'); await sleep(450);
    const feature = before.features?.find(f => f.type === 'select');
    if (feature) {
      const option = feature.options.find(o => o.id !== feature.value);
      if (option) {
        await page.getByRole('button', { name: /^Speed:/ }).last().click();
        await page.getByRole('button', { name: option.label, exact: true }).click();
        await waitFor(a => a.features?.some(f => f.id === feature.id && f.value === option.id));
        await page.locator('button[aria-label^="Speed: "]:not([disabled])').last().waitFor({ state: 'visible', timeout: 45000 });
        check(await input.inputValue() === 'Composer reference draft', 'Configuration preserves the message draft and unlocks controls');
        // This session is deleted in finally; no second configuration write races the UI operation.
      }
    }
    await input.press('ControlOrMeta+A'); await input.press('Backspace'); await sleep(600);
    check(await input.inputValue() === '', 'Typed fixture draft can be cleared before navigation');
    for (const width of [750, 680]) {
      await page.setViewportSize({ width, height: 1000 }); s.w = width; s.clip = { x: 320, y: 0, width: width - 320, height: 1000 };
      await reopen();
      await order('Dark compact ' + width); await capture('dark-compact-' + width + '.png');
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1550, height: 1000 }); s.w = 1550; s.clip = { x: 320, y: 0, width: 1230, height: 1000 };
    await reopen();
    await order('Light desktop'); await capture('light-desktop.png');
    check(!(await snapshot()).lastUserMessageAt, 'Layout and draft checks send no model prompt');
    check(report.pageErrors.length === 0, 'No UI page errors');
  } else {

  await modelChip().click();
  await page.getByRole('button', { name: second.label, exact: true }).click();
  await waitFor(a => a.model === second.id);
  check(true, 'Desktop UI model picker changes real native state');
  await modelChip().click();
  await sleep(250); await shot(s, join(out, 'desktop-models.png'));
  check(!(await page.getByRole('button', { name: 'Speed', exact: true }).count()) && !(await page.getByRole('button', { name: 'Plan', exact: true }).count()), 'Provider controls are removed from model menu');
  const box = await page.getByRole('button', { name: first.label, exact: true }).boundingBox();
  check(box && box.y >= 0 && box.y + box.height <= 1000, 'Desktop model choices stay in viewport');
  await page.getByRole('button', { name: first.label, exact: true }).click(); await waitFor(a => a.model === first.id);
  for (const f of before.features || []) {
    const option = f.type === 'select' ? f.options.find(o => o.id !== f.value) : null;
    const value = f.type === 'toggle' ? !f.value : option?.id;
    if (value === undefined) continue;
    const trigger = page.getByRole(f.type === 'toggle' ? 'switch' : 'button', { name: new RegExp('^' + f.label + ':') }).last();
    await modelChip().waitFor({ state: 'visible' });
    const rect = await trigger.boundingBox();
    check(rect && rect.width <= 34 && (await trigger.textContent()).trim() === '', f.label + ' has its own icon-only toolbar control');
    await trigger.click();
    if (option) await page.getByRole('button', { name: option.label, exact: true }).click();
    await waitFor(a => a.features?.some(x => x.id === f.id && x.value === value));
    check(true, `Desktop UI ${f.label} control changes native state`);
    if (f.type === 'toggle') {
      await page.getByRole('switch', { name: new RegExp('^' + f.label + ':'), checked: value }).last().waitFor({ state: 'visible' });
      check((await trigger.getAttribute('aria-checked')) === String(value), 'Plan icon exposes its actual checked state');
      check(!(await modelChip().getAttribute('aria-label')).includes(f.label), 'Active Plan is not appended to model label');
    } else {
      await modelChip().waitFor({ state: 'visible' });
      await trigger.click(); await sleep(250); await shot(s, join(out, 'desktop-feature-icons.png'));
      const normal = page.getByRole('button', { name: f.options.find(o => o.id === f.value)?.label || 'Normal', exact: true });
      const b = await normal.boundingBox(); check(b && b.x >= 320 && b.x + b.width <= 1550, 'Feature popup fits desktop pane');
      await trigger.click();
    }
    if (f.value !== null) await configure({ feature: { id: f.id, value: f.value } });
  }
  await modelChip().waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'More session actions', exact: true }).click();
  await page.getByText('Reload session', { exact: true }).last().click();
  await waitFor(a => a.status !== 'initializing');
  check((await snapshot()).id === sessionId, 'Idle reload preserves the same session');
  await page.setViewportSize({ width: 750, height: 1000 }); s.w = 750; s.clip = { x: 320, y: 0, width: 430, height: 1000 };
  // Responsive navigation intentionally returns to the card overview.
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
  await modelChip().click(); await sleep(250); await shot(s, join(out, 'compact-models.png'));
  await page.getByRole('button', { name: second.label, exact: true }).click(); await waitFor(a => a.model === second.id);
  check(true, 'Compact UI model picker changes real native state');
  for (const f of before.features || []) {
    const option = f.type === 'select' ? f.options.find(o => o.id !== f.value) : null;
    const value = f.type === 'toggle' ? !f.value : option?.id;
    if (value === undefined) continue;
    await modelChip().waitFor({ state: 'visible' });
    const trigger = page.getByRole(f.type === 'toggle' ? 'switch' : 'button', { name: new RegExp('^' + f.label + ':') }).last();
    await trigger.click();
    if (option) { await sleep(250); await shot(s, join(out, 'compact-feature-icons.png')); await page.getByRole('button', { name: option.label, exact: true }).click(); }
    await waitFor(a => a.features?.some(x => x.id === f.id && x.value === value));
    check(true, 'Compact UI ' + f.label + ' icon changes native state');
    if (f.value !== null) await configure({ feature: { id: f.id, value: f.value } });
  }
  await writeFile(join(out, 'page-text.txt'), await pageText(s));
  await configure({ modelId: first.id });
  // Only reload the plugin, not the daemon or canvas.
  await client.reloadPlugin('flowly');
  check((await snapshot()).model === first.id, 'Model state survives Flowly reload');
  check(report.pageErrors.length === 0, 'No UI page errors');
  }
} catch (e) {
  if (lastSurface) {
    await shot(lastSurface, join(out, 'failure.png')).catch(() => {});
    await writeFile(join(out, 'failure-text.txt'), await pageText(lastSurface)).catch(() => {});
  }
  report.failure = String(e.message).replace(/https?:\/\/\S+/g, '[URL]').slice(0, 400);
  console.log(JSON.stringify({ failure: report.failure })); process.exitCode = 1;
} finally {
  await Promise.allSettled(contexts.map(c => c.close())); await browser?.close().catch(() => {});
  if (webServer) await new Promise(r => webServer.close(r));
  if (client) {
    const current = await snapshot().catch(() => null);
    if (current?.labels?.['flowly-parity-fixture'] === sessionId) await client.deleteAgent(sessionId).catch(() => { report.cleanup.deleteFailed = true; });
    report.cleanup.sessionAbsent = !(await snapshot().catch(() => null));
    const board = await rpc('board.read', {}).catch(() => null);
    report.cleanup.cardPreserved = board?.tasks.some(t => t.id === taskId && t.workspaceId === workspaceId);
    await client.close();
  }
  report.cleanup.browserClosed = true;
  if (!report.cleanup.sessionAbsent || !report.cleanup.cardPreserved) process.exitCode = 1;
  await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
