---
name: status
description: Give a concise, read-only checkpoint of Toolpath-template work, test state, and uncommitted risks. Use when asked for status or a session checkpoint.
---

# Status

Produce a compact, read-only checkpoint. Inspect `git status --short`,
`git diff --stat`, staged and unstaged diffs, the current branch, and commits
ahead of its upstream when one exists. Do not assume `origin/main` is the
comparison point when no upstream is configured.

Separate the report into committed-but-unpushed work, staged work, and
unstaged/untracked work. Name only a few files; summarize larger groups.

Then identify only evidence-backed open items:

- test results from the most relevant existing command, if it is safe and
  proportionate to run (`pnpm test` for unit work; `pnpm test:e2e` for an E2E
  change);
- new TODO/FIXME markers or skipped/focused tests introduced in the diff;
- uncommitted dependency or lockfile changes that have not been verified;
- potential secret exposure, especially any environment file other than the
  tracked `apps/dfm/.env.example` template.

Never read or print environment-file contents. Do not invent a missing PR or
work item. End with at most three optional next steps.
