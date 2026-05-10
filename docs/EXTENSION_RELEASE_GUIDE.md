# SPEQ VS Code Extension Release Guide

This guide describes two release paths for `speq-vscode-extension`:

- manual publish from local machine;
- automatic publish from GitHub Actions on push to `master`/`main`.

## 1) Prerequisites

Before first release, prepare Marketplace access once.

### 1.1 Create publisher and token

1. Sign in to [Visual Studio Marketplace Publisher Management](https://marketplace.visualstudio.com/manage).
2. Create/select publisher `stepankaziatko` (must match `package.json` -> `publisher`).
3. Create Personal Access Token for Marketplace publishing.
4. Save token securely:
   - local machine: use interactive `vsce login`;
   - GitHub Actions: store token in repo secret `VSCE_PAT`.

### 1.2 Validate extension metadata

Check `package.json` fields before every release:

- `name`;
- `displayName`;
- `publisher`;
- `version` (must be new);
- `engines.vscode`.

## 2) Manual release (local)

Use this when you need controlled or emergency publication.

### 2.1 Prepare release commit

1. Bump version:
   - patch: `npm version patch`
   - minor: `npm version minor`
   - major: `npm version major`
2. Verify build:
   - `npm ci`
   - `npm run check`
3. Commit/push version bump.

### 2.2 Publish to Marketplace

From repository root:

```bash
npx @vscode/vsce publish
```

For explicit version bump at publish step:

```bash
npx @vscode/vsce publish patch
```

For manual build .vsix

```bash
npx @vscode/vsce package
```

After publish:

- verify extension page in Marketplace;
- install/update from VS Code Extensions view and smoke-test key flows.

## 3) Automatic release via GitHub push

Recommended flow: merge delivery branches into release-candidate branch, then final PR to `main`, and publish from `main` (or `master` if your repo uses it).

### 3.1 Required repo secrets

In GitHub repository settings -> Secrets and variables -> Actions:

- `VSCE_PAT`: Visual Studio Marketplace token.

### 3.2 Workflow example

Create `.github/workflows/release.yml`:

```yaml
name: release-extension

on:
  push:
    branches: [main, master]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install deps
        run: npm ci

      - name: Build/check
        run: npm run check

      - name: Publish to VS Code Marketplace
        env:
          VSCE_PAT: ${{ secrets.VSCE_PAT }}
        run: npx @vscode/vsce publish
```

### 3.3 Notes for stable automation

- Workflow publishes whatever `version` is in `package.json`; version must be incremented before merge to `main/master`.
- Marketplace rejects duplicate versions.
- Keep `ci.yml` as pre-merge quality gate; release workflow should run only after merge to release branch.

## 4) Recommended release checklist

1. `npm ci`
2. `npm run check`
3. Update `package.json` version.
4. Merge to `main/master` via release flow.
5. Publish (manual or auto).
6. Verify install/update in clean VS Code profile.

## 5) Troubleshooting

- `You do not have permission to publish`: wrong `VSCE_PAT` scope or publisher mismatch.
- `Extension version already exists`: bump `package.json` version and rerun.
- Build passes locally but fails in Actions: check Node version parity (`20`) and lockfile consistency.
