---
name: push
description: Push local commits for the Toolpath template safely after an explicit user request. Use when asked to push or publish a branch.
---

# Push

Push only when the user explicitly asks. Start by inspecting `git status`, the
current branch, its upstream, and the commits ahead of that upstream. If no
upstream exists, identify the branch and commits that would be published before
using `git push -u origin <branch>`.

For a direct push to `main`, show the commits and ask for a final confirmation
in the same turn before pushing. The repository CI will run `pnpm check`, the
Playwright E2E suite, and the production Docker build on pull requests and on
pushes to `main`; do not claim local CI equivalence unless those relevant gates
were actually run.

Never use `--force`, `--force-with-lease`, or `--no-verify`. If the push is
rejected as non-fast-forward, do not rewrite history: report the remote change
and let the user decide whether to rebase or merge. Preserve any unrelated
uncommitted work.

After a successful push, report the branch and pushed commit range. Include a
repository or branch URL only when it can be derived safely from `origin`.
