# CLAUDE.md

Guidance for working in the `@absmartly/cli` (`abs`) repository.

## Build, test, lint

```bash
bun install            # install deps (worktrees do NOT share node_modules — install per worktree)
npm run build          # tsc
npm test               # vitest
npm run typecheck      # tsc --noEmit
npm run lint           # eslint src --ext .ts
npm run format         # prettier --write 'src/**/*.ts'
```

- **Prettier scope is `src/**/*.ts` only.** Markdown/README/JSON are NOT formatted by `npm run format` and are not checked by the pre-push hook. Do not run `prettier --write` on README or other non-`src` files — it reflows unrelated content and bloats the diff.
- A **pre-push hook runs `prettier --check`** on `src`. ESLint and `tsc` passing does NOT mean Prettier passes — run `npm run format` (or `prettier --write` on changed `src` files) before pushing.

## Branching

- Branch from `origin/main` (never `development`, which is dead).
- Feature branches: `feat/<JIRA-ID>/<short-description>`; releases: `chore/release-<version>`.
- Work in worktrees under `.worktrees/` (git-ignored). Create with `--no-track` so the first `git push -u origin <branch>` doesn't try to update `main`.

## Releasing & versioning (IMPORTANT — read before merging)

Releases are automated by `.github/workflows/release-please.yml` (the "Publish" workflow), which runs **on every push to `main`**:

1. A `detect` job reads `version` from `package.json` and checks npm. If `@absmartly/cli@<version>` is **not** already published, it publishes; otherwise it **skips**.
2. On publish it runs `npm publish --access public`, then tags `v<version>` and creates a GitHub release.

So **a release happens only when a merged commit changes `package.json` to a version not yet on npm.** The convention is **one minor bump per release** (`npm version minor --no-git-tag-version`, committed as `chore(release): bump cli to X.Y.Z`).

`main` is protected by a **required merge queue**, and repo-level auto-merge is enabled. Queue a PR with `gh pr merge --auto --squash <n>`; it enters the queue once its checks are green. If that ever fails, enqueue directly via GraphQL:

```bash
PRID=$(gh pr view <n> --json id --jq .id)
gh api graphql -f query='mutation($id:ID!){ enqueuePullRequest(input:{pullRequestId:$id}){ mergeQueueEntry { position state } } }' -f id="$PRID"
```

### Multi-PR merge-order gotcha (this WILL bite you)

The publish workflow builds from the **merge commit**, and the merge queue serializes merges. If two PRs are in flight and only one carries the version bump, **whichever bumped commit merges first publishes a version that does not yet contain the later-merged PR's code** — and the later PR's own publish run fails (duplicate version) or no-ops.

This happened with 1.8.0: the events PR carried the bump and merged first, so npm `1.8.0` shipped the events feature only; the metrics PR merged after and was never published. Recovered with a `1.9.0` release PR off `main` (which by then contained both features).

**Rules:**
- Give **each PR that should produce a release its own version bump.** Don't leave a feature PR un-bumped expecting another PR to release it.
- If intentionally batching several PRs into one release, only the **last-merged** PR should carry the bump (so the published commit includes everything), or cut a separate `chore/release-X.Y.Z` PR off `main` after the features land.
- After merging, verify the published artifact: `npm view @absmartly/cli version` and confirm the expected source files are in the tagged commit.
