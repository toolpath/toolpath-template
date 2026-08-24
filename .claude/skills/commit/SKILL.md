---
name: commit
description: Stage selected Toolpath-template changes and create a local commit without pushing. Use when asked to commit or checkpoint work.
---

# Commit

Create a local commit only after the user explicitly asks. Do not push as a
side effect.

1. Inspect `git status --short`, `git diff`, and `git diff --cached`. Preserve
   all unrelated changes already in the worktree. If nothing is selected for
   the commit, say so rather than creating an empty commit.
2. Stage explicit paths only. Never use `git add .` or `git add -A`.
3. Never stage environment files, including `apps/dfm/.env` and any `*.env`
   file other than a deliberate documented template such as `.env.example`.
   Also exclude keys, credentials, tokens, private URLs, and generated test
   artifacts (`apps/*/test-results/`, `apps/*/playwright-report/`). Warn if
   any are present, but do not inspect their contents.
4. Use a concise factual commit subject (under 72 characters) that explains
   the change. Do not add AI attribution or co-author trailers.
5. Let the Husky pre-commit hook run. It uses lint-staged/Prettier; never
   bypass a failed hook with `--no-verify`.

Report the commit hash, subject, and number of changed files. Mention that the
commit is local and has not been pushed.
