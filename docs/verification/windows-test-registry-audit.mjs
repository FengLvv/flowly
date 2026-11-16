// Read-only audit: never edits native or Flowly storage and never logs credentials.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { openLocalDaemon } from '../../server/local-daemon.ts';

const home = join(homedir(), '.paseo');
const projects = JSON.parse(await readFile(join(home, 'projects/projects.json'), 'utf8'));
const workspaces = JSON.parse(await readFile(join(home, 'projects/workspaces.json'), 'utf8'));
let client;
try {
  client = await openLocalDaemon(home, 'flowly-windows-test-registry-audit', [], '');
  const board = await client.invokePluginRpc('flowly', 'board.read', {});
  if (!Array.isArray(board.projects) || !Array.isArray(board.tasks)) throw Error('Incomplete board snapshot');
  const normalize = p => String(p ?? '').replaceAll('\\', '/').toLowerCase().replace(/\/$/, '');
  const entries = await Promise.all(projects.filter(p => /[/\\]ultra-linked-[^/\\]+[/\\]/.test(p.rootPath)).map(async p => {
    const fixtureRoot = dirname(dirname(p.rootPath));
    const relatedPath = path => normalize(path).startsWith(normalize(fixtureRoot) + '/') || normalize(path) === normalize(fixtureRoot);
    const ws = workspaces.filter(w => w.projectId === p.projectId || relatedPath(w.cwd));
    const bp = board.projects.filter(b => b.paseoProjectId === p.projectId || [b.primaryPath, ...(b.repos ?? [])].some(relatedPath));
    const cards = board.tasks.filter(t => bp.some(b => b.id === t.projectId) || ws.some(w => w.workspaceId === t.workspaceId) || [t.sourcePath, ...(t.repoPaths ?? [])].some(relatedPath));
    const s = await stat(fixtureRoot).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
    return { projectId: p.projectId, rootPath: p.rootPath, createdAt: p.createdAt, updatedAt: p.updatedAt, archivedAt: p.archivedAt, fixtureRootExists: !!s,
      workspaces: ws.map(w => ({ workspaceId: w.workspaceId, archivedAt: w.archivedAt, background: w.background })),
      boardProjectIds: bp.map(b => b.id), cardIds: cards.map(t => t.id) };
  }));
  const report = { at: new Date().toISOString(), nativeProjectIds: projects.map(p => p.projectId).sort(), nativeWorkspaceIds: workspaces.map(w => w.workspaceId).sort(),
    boardBindings: board.projects.map(p => ({ id: p.id, paseoProjectId: p.paseoProjectId, primaryPath: p.primaryPath })), entries };
  await writeFile(resolve(process.argv[2] ?? 'docs/verification/windows-test-registry-before.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ at: report.at, projects: projects.length, allWorkspaces: workspaces.length, entries }, null, 2));
} finally { await client?.close(); }
