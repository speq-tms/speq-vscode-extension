# speq-vscode-extension

VS Code extension for `speq` YAML-based tests.

## Scope

Open-source MVP focuses on:

- test tree explorer;
- diagnostics powered by `speq validate --format json`;
- run actions that call `speq-cli`;
- quick manifest/environment preview.

## Design principle

Extension is an interface layer and must not contain a separate runner implementation.

## Structure

```text
src/
  extension.ts
  tree/
  preview/
  diagnostics/
docs/
```

## Requirements

- `speq` CLI installed and available in `PATH`.
- Workspace follows `in-repo` (`.speq/`) or `test-repo` layout.

## Implemented MVP features

- Suites explorer for YAML tests in `suites/`.
- Diagnostics from `speq validate --speq-root <root> --format json`.
- Run actions via CLI:
  - run suite (`speq run --suite ...`)
  - run test (`speq run --test ...`)
- Quick preview for:
  - `manifest.yaml`
  - `environments/*.yaml`

## Commands

- `speq: Refresh Suites`
- `speq: Validate Workspace`
- `speq: Run Suite`
- `speq: Run Test`
- `speq: Preview Manifest`
- `speq: Preview Environment`

## Local development

- Install dependencies: `npm install`
- Compile: `npm run compile`

## Status

OSS MVP extension is implemented as interface-only layer over `speq-cli`.
