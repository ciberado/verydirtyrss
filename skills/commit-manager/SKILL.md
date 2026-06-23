---
name: commit-manager
description: Use for conventional commits, version bumps (patch/minor), git tagging, and CHANGELOG.md updates.
---

# Commit Manager

Manage conventional commits, npm version bumps with git tags, and CHANGELOG.md for this project.

## Trigger / Scope

- User says "commit", "conventional commit", "changelog", "bump version", "patch", "minor", "release"
- Works with staged and unstaged changes in the workspace
- Uses `npm version` (which auto-tags via git) for version bumps

## Workflow

### 1. Check state first

```bash
git status                                          # see what's staged/unstaged
git log --oneline -5                                # recent commit history
```
If there are unstaged changes, ask whether to stage all (`git add -A`) or specific files.

### 2. Conventional commit (no version bump)

```bash
git commit -m "type(scope): description"
```

Common types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `build`.

### 3. Version bump + commit + tag (patch or minor)

When the user says "commit as patch" or "this is a minor change":

```bash
# Stage everything
git add -A

# Bump version, create commit and tag (npm version auto-commits and tags)
npm version patch -m "chore(release): %s"           # for bug fixes
# or
npm version minor -m "chore(release): %s"           # for new features
```

`npm version` bumps `package.json` + `package-lock.json`, creates a git commit, and creates an annotated tag. Do not call `git commit` separately.

### 4. Update CHANGELOG.md

After the version tag is set, update (or create) the CHANGELOG.md at the workspace root. Append a new entry at the top:

```markdown
# Changelog

## [1.2.0] - 2026-06-23

### Added
- New feature description

### Fixed
- Bug fix description
```

Group entries under `### Added`, `### Fixed`, `### Changed`, `### Removed` based on commit types (`feat` → Added, `fix` → Fixed, `refactor` → Changed, etc.). If no CHANGELOG.md exists, create it with this format.

### 5. Push

```bash
git push --follow-tags origin main                  # pushes commits + annotated tags
```

## Validation

- After `npm version`, run `git describe --tags --abbrev=0` to confirm the tag
- After the changelog write, read it back to verify formatting
- After push, confirm no errors in output
- Run `npm run build` before pushing to ensure the code compiles

## Safety Notes

- `npm version` creates a git commit and tag automatically — do not commit after it
- `--follow-tags` only pushes annotated tags; `npm version` creates annotated tags by default
- Do NOT use `npm version major` unless the user explicitly asks for a major bump
- If `package-lock.json` is dirty after `npm version`, stage and commit it separately inside the same release commit
- If the user only asks for a commit (no version bump), skip `npm version` and the changelog update
