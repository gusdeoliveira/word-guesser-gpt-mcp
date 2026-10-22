import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';
import { onTestFinished, test as vitestTest } from 'vitest';

const test = process.env.VITEST ? vitestTest : nodeTest;

const script = fileURLToPath(new URL('./session-close.mjs', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../hooks.json', import.meta.url), 'utf8'));

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codex-close-'));
  const cleanup = () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('codex-close-'));
    rmSync(root, { recursive: true, force: true });
  };
  if (process.env.VITEST) onTestFinished(cleanup);
  else t.after(cleanup);
  const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args], {
    encoding: 'utf8', windowsHide: true,
  });
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };
  git('init', '--quiet');
  git('config', 'user.name', 'Hook Test');
  git('config', 'user.email', 'hook-test@example.invalid');
  git('config', 'core.autocrlf', 'false');
  write('source.txt', 'initial\n');
  write('deleted.txt', 'delete me\n');
  write('.gitignore', 'ignored/\n.env\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'Fixture');
  const head = git('rev-parse', 'HEAD');
  const hook = (extra = {}) => {
    const result = spawnSync(process.execPath, [script], {
      cwd: root, input: JSON.stringify({ hook_event_name: 'Stop', session_id: 'test-session', cwd: root, ...extra }),
      encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git('rev-parse', 'HEAD'), head, 'hook must never commit');
    return JSON.parse(result.stdout);
  };
  const staged = () => git('diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean).sort();
  return { root, git, write, hook, staged };
}

test('stages additions, modifications, deletions and literal filenames, then asks once', (t) => {
  const f = fixture(t);
  f.write('source.txt', 'changed\n');
  f.write('new file [1].txt', 'new\n');
  rmSync(path.join(f.root, 'deleted.txt'));
  const result = f.hook();
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /\$github-pr-publish/);
  assert.match(result.reason, /Wait for an explicit response/);
  assert.deepEqual(f.staged(), ['deleted.txt', 'new file [1].txt', 'source.txt']);
  assert.deepEqual(f.hook(), {}, 'unchanged inventory must not ask again');
  f.write('source.txt', 'changed again\n');
  assert.equal(f.hook().decision, 'block', 'new changes need another review');
  assert.equal(f.git('show', ':source.txt'), 'changed\n', 'mixed file index stays intact');
});

test('excludes ignored files, local credentials, logs and generated output', (t) => {
  const f = fixture(t);
  for (const file of ['.env', '.env.production', 'local.settings.json', 'private.pem', 'build.log', 'dist/out.js', 'ignored/file.txt', '.aws/credentials']) f.write(file, 'local\n');
  f.write('.env.example', 'EXAMPLE=value\n');
  f.write('docs/guide.md', 'meaningful\n');
  f.hook();
  assert.deepEqual(f.staged(), ['.env.example', 'docs/guide.md']);
});

test('preserves preexisting staged hunks and leaves mixed files for review', (t) => {
  const f = fixture(t);
  f.write('source.txt', 'selected\n');
  f.git('add', '--', 'source.txt');
  f.write('source.txt', 'selected\nunselected\n');
  f.write('new.txt', 'new\n');
  const result = f.hook();
  assert.equal(f.git('show', ':source.txt'), 'selected\n');
  assert.equal(readFileSync(path.join(f.root, 'source.txt'), 'utf8'), 'selected\nunselected\n');
  assert.match(result.reason, /Partially staged paths preserved for review: \["source.txt"\]/);
  assert.deepEqual(f.staged(), ['new.txt', 'source.txt']);
});

test('does not add tracked files that have become ignored', (t) => {
  const f = fixture(t);
  f.write('.gitignore', 'source.txt\n');
  f.write('source.txt', 'local ignored change\n');
  f.hook();
  assert.deepEqual(f.staged(), ['.gitignore']);
});

test('SessionEnd stages without a blocking continuation or publication', (t) => {
  const f = fixture(t);
  f.write('final.txt', 'final\n');
  const result = f.hook({ hook_event_name: 'SessionEnd' });
  assert.equal(result.decision, undefined);
  assert.match(result.systemMessage, /explicit user confirmation/);
  assert.deepEqual(f.staged(), ['final.txt']);
  assert.equal(f.hook().decision, 'block', 'next open turn still offers review');
});

test('clean repositories, unrelated events and recursive Stop continuations do nothing', (t) => {
  const f = fixture(t);
  assert.deepEqual(f.hook(), {});
  f.write('source.txt', 'changed\n');
  assert.deepEqual(f.hook({ stop_hook_active: true }), {});
  assert.deepEqual(f.hook({ hook_event_name: 'SubagentStop' }), {});
  assert.deepEqual(f.staged(), []);
});

test('runs from a repository subdirectory', (t) => {
  const f = fixture(t);
  f.write('nested/file.txt', 'new\n');
  assert.equal(f.hook({ cwd: path.join(f.root, 'nested') }).decision, 'block');
  assert.deepEqual(f.staged(), ['nested/file.txt']);
});

test('hook configuration launches correctly from a subdirectory', (t) => {
  const f = fixture(t);
  f.write('.codex/hooks/session-close.mjs', readFileSync(script, 'utf8'));
  f.write('nested/file.txt', 'new\n');
  const command = config.hooks.Stop[0].hooks[0].command;
  const result = spawnSync(command, {
    shell: true, cwd: path.join(f.root, 'nested'),
    input: JSON.stringify({ hook_event_name: 'Stop', session_id: 'launch-test', cwd: path.join(f.root, 'nested') }),
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).decision, 'block');
});

test('conflicts prevent automatic staging', (t) => {
  const f = fixture(t);
  const original = f.git('rev-parse', 'HEAD:source.txt').trim();
  f.git('update-index', '--force-remove', 'source.txt');
  execFileSync('git', ['-C', f.root, 'update-index', '--index-info'], {
    input: [1, 2, 3].map((stage) => `100644 ${original} ${stage}\tsource.txt\n`).join(''),
    windowsHide: true,
  });
  f.write('new.txt', 'must stay unstaged\n');
  const result = f.hook();
  assert.equal(result.decision, undefined);
  assert.match(result.systemMessage, /resolve Git conflicts first/);
  assert.equal(f.git('ls-files', '--stage', '--', 'new.txt'), '');
});
