// Exercise the real installed CLI once, using a fresh empty home. No daemon is started.
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { paseoInvocation, resolvePaseoCli } from '../../server/paseo-cli.ts';

const cli = await resolvePaseoCli();
const home = await mkdtemp(join(tmpdir(), 'flowly-cli-isolation-'));
try {
  const env = { ...process.env, PASEO_HOME: home, NODE_ENV: 'test', FLOWLY_TELEMETRY: '0' };
  for (const name of ['PASEO_HOST', 'PASEO_AGENT_ID', 'PASEO_AGENT_CWD', 'PASEO_WORKSPACE_ID']) delete env[name];
  const run = await paseoInvocation(cli, ['project', 'ls', '--home', home, '--json'], process.platform, env);
  let result;
  try {
    await promisify(execFile)(run.file, run.args, { env: run.env ?? env, timeout: 15000, maxBuffer: 16384 });
    throw Error('Real CLI unexpectedly reached a daemon with an empty home');
  } catch (error) {
    assert.equal(typeof error.code, 'number', 'CLI must exit, not timeout or fail to spawn');
    assert.notEqual(error.code, 0);
    assert.match(error.stderr, /daemon|paseo\.pid|ENOENT/i);
    result = { exit: error.code, stdout: error.stdout.trim(), stderr: error.stderr.trim() };
  }
  for (const file of ['paseo.pid', 'local-credential'])
    await assert.rejects(access(join(home, file)), { code: 'ENOENT' });
  console.log(JSON.stringify({ home, result, daemonCreated: false, credentialCreated: false }, null, 2));
} finally {
  await rm(home, { recursive: true, force: true });
}
