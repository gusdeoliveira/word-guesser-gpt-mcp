import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Hooks use stdin/stdout JSON. Never launch a nested Codex process or publish here.
const emit = (value = {}) => process.stdout.write(`${JSON.stringify(value)}\n`);
const splitPaths = (value) => value.split('\0').filter(Boolean);
const digest = (value) => createHash('sha256').update(value).digest('hex');

function isMeaningful(file) {
  const parts = file.toLowerCase().split('/');
  const name = parts.at(-1);
  if (parts.some((part) => ['node_modules', 'dist', 'coverage', '.git', '.cache', '.aws', '.ssh'].includes(part))) return false;
  if (name === '.env.example') return true;
  return !(/^\.env(?:\.|$)/.test(name)
    || /\.(?:log|tmp|temp|bak|pem|key|pfx|p12)$/.test(name)
    || /^(?:local\.settings\.json|credentials|credentials\.json|id_rsa|id_ed25519|\.ds_store|thumbs\.db)$/.test(name));
}

function run(event) {
  if (!['Stop', 'SessionEnd'].includes(event.hook_event_name)) return {};
  if (event.hook_event_name === 'Stop' && event.stop_hook_active) return {};
  if (!event.cwd || !event.session_id) throw new Error('Hook input requires cwd and session_id.');

  // Trust only the explicitly supplied working directory, never all repositories.
  let cwd = path.resolve(event.cwd);
  // Find the worktree root without Git first: ownership checks also apply when
  // invoking Git from a subdirectory, including when this hook runs on Windows.
  while (!existsSync(path.join(cwd, '.git'))) {
    const parent = path.dirname(cwd);
    if (parent === cwd) return {};
    cwd = parent;
  }
  const git = (...args) => execFileSync('git', ['-c', `safe.directory=${cwd.replaceAll('\\', '/')}`, '-C', cwd, ...args], {
    encoding: 'utf8', timeout: event.hook_event_name === 'SessionEnd' ? 1200 : 10000,
    maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    env: { ...process.env, GIT_LITERAL_PATHSPECS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const root = git('rev-parse', '--show-toplevel').trim();
  const staged = new Set(splitPaths(git('diff', '--cached', '--name-only', '-z')));
  const unstaged = new Set(splitPaths(git('diff', '--name-only', '-z')));
  const untracked = splitPaths(git('ls-files', '--others', '--exclude-standard', '-z'));
  const conflicts = splitPaths(git('diff', '--name-only', '--diff-filter=U', '-z'));
  if (conflicts.length) return { systemMessage: 'Session staging skipped: resolve Git conflicts first. No changes were published.' };

  const all = [...new Set([...staged, ...unstaged, ...untracked])].sort();
  const ignored = new Set(splitPaths(git('ls-files', '--cached', '--ignored', '--exclude-standard', '-z')));
  const meaningful = all.filter((file) => isMeaningful(file) && !ignored.has(file));
  if (!meaningful.length) return {};
  // Preserve intentionally staged hunks. A human/agent must review mixed files.
  const mixed = meaningful.filter((file) => staged.has(file) && unstaged.has(file));
  const selected = meaningful.filter((file) => !staged.has(file));
  if (selected.length) git('add', '--all', '--', ...selected);
  if (event.hook_event_name === 'SessionEnd') {
    return { systemMessage: selected.length
      ? `Staged ${selected.length} final changed path(s). Publication requires explicit user confirmation in the chat; resume it to review.`
      : 'Session changes remain staged for review. Publication requires explicit user confirmation.' };
  }

  // Remember the resulting tree, so unchanged work (including a declined push)
  // doesn't cause another question on every turn. State stays out of source control.
  const hash = createHash('sha256').update(git('diff', '--cached', '--raw', '-z'));
  for (const file of meaningful) {
    hash.update(file).update('\0');
    const absolute = path.join(root, file);
    if (!existsSync(absolute)) { hash.update('deleted'); continue; }
    const stat = lstatSync(absolute);
    hash.update(String(stat.mode));
    hash.update(stat.isSymbolicLink() ? readlinkSync(absolute) : readFileSync(absolute));
  }
  const fingerprint = hash.digest('hex');
  const stateDir = git('rev-parse', '--absolute-git-dir').trim();
  const statePath = path.join(stateDir, 'codex-session-close', `${digest(event.session_id)}.json`);
  const previous = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  if (previous.fingerprint === fingerprint) return {};
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ fingerprint }), 'utf8');
  return {
    decision: 'block',
    reason: [
      'Session close review: meaningful candidate changes have been staged; nothing has been committed or pushed.',
      `Newly staged paths: ${JSON.stringify(selected)}.`,
      `Partially staged paths preserved for review: ${JSON.stringify(mixed)}.`,
      `Excluded local/generated paths: ${JSON.stringify(all.filter((file) => !isMeaningful(file) || ignored.has(file)))}.`,
      'Inspect the staged diff and summarize the meaningful changes by path and hunk. Review the candidates for generated files or sensitive content; exclude any such newly staged content while preserving preexisting staged hunks.',
      'Ask the user: "Publish these listed changes using $github-pr-publish? Reply yes to publish all listed changes, or specify which to publish, stash, or leave untouched."',
      'Wait for an explicit response. A yes applies only to the inventory shown. On yes, invoke $github-pr-publish and follow its required delegated worker and scope verification workflow. Do not stash anything without explicit selection. On no or no answer, leave the changes staged and do not commit, push, or create a PR.',
      'Do not ask again for an unchanged inventory. If the user has already answered a publication question covering this exact inventory in the current turn, honor that answer.',
    ].join('\n'),
  };
}

try {
  emit(run(JSON.parse(readFileSync(0, 'utf8'))));
} catch (error) {
  // A hook failure must not become consent or prevent the user from closing.
  emit({ systemMessage: `Session staging could not complete: ${error.message}. Review Git status manually; no publication was attempted.` });
}
