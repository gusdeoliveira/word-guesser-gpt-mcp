# Session staging and publishing

This repository uses the [Codex lifecycle hooks](https://learn.chatgpt.com/docs/hooks)
in `.codex/hooks.json`. Node and Git must be on PATH.

Open a new Codex session in this trusted repository, run `/hooks`, and review and
trust both hook definitions. Codex skips new or changed hooks until trusted.
No global configuration or hook trust is changed by these files.

- `Stop` stages candidate changes before the assistant finishes a turn, then
  asks the assistant to review the diff and request publication approval. A
  real `SessionEnd` cannot keep a closed chat open to ask a question.
- `SessionEnd` stages final candidate changes when Codex closes, the conversation
  is archived/deleted, or an unopened chat expires. Resume the chat to confirm
  publication if the final changes were not reviewed before closing.
- Ignored untracked files, ignored tracked updates, common build directories,
  local environment/credential files, and logs are excluded. `.env.example`
  remains eligible. This is a path filter, not a semantic or secret scanner;
  the assistant reviews the staged diff before proposing publication.
- All eligible changes in the repository are candidates, including changes
  from before the session. Existing staged hunks are preserved; files with both
  staged and unstaged edits are left for explicit review. Conflicts skip staging.
- An unchanged inventory prompts once per session. A changed inventory prompts
  again. State lives under the worktree's Git directory, not in tracked files.
- A yes to the displayed inventory invokes `$github-pr-publish`, including its
  delegated Git/GitHub worker and scope checks. Other changes require their own
  selection. No answer or no leaves changes staged. Stashing needs explicit
  authorization. The hooks never commit, push, or create a PR themselves.

Run the isolated Git integration checks with:

```powershell
node --test .codex/hooks/session-close.test.mjs
```
