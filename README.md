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
- `speq: Select Active Root`
- `speq: Allure Serve`
- `speq: Open Test Flow`
- `speq: Generate Report`
- `speq: Generate Summary Report`
- `speq: Report All`
- `speq: Open Summary Report`
- `speq: Open Allure Directory`

## CLI calls executed by extension

- Validate workspace: `speq validate --speq-root <root> --format json`
- Run suite: `speq run --speq-root <root> --suite <suitePath>`
- Run test: `speq run --speq-root <root> --test <testPath>`

## Local cargo mode (for speq-cli development)

You can switch command execution from installed `speq` binary to local `cargo run`.

Example workspace settings:

```json
{
  "speq.cli.mode": "cargo",
  "speq.cli.cargoProjectPath": "../speq-cli",
  "speq.cli.cargoRunArgs": [],
  "speq.cli.binaryPath": "speq"
}
```

In this mode extension will run commands like:

- `cargo run -- validate --speq-root <root> --format json`
- `cargo run -- run --speq-root <root> --test <testPath>`
- `cargo run -- run --speq-root <root> --suite <suitePath>`

## Studio-oriented UX (Phase B baseline)

- `Studio Home` web view (React) is the primary SPEQ interface in the sidebar.
- Home provides quick actions for run/validate/flow/results.
- Active environment can be selected from Home and reused in run commands.
- Home includes a `Runner` block that assembles and executes `speq run` options (`target`, `env`, `tags`, `report`).
- YAML CodeLens:
  - `Run Test` / `Run Suite` for suite files;
  - `Validate Workspace` from current file.

## Test Flow visualization (Phase C baseline)

- Open a test flow diagram from:
  - `speq: Open Test Flow` command;
  - CodeLens in test YAML;
  - context action in `Suites` and `Studio Map`.
- Diagram includes:
  - execution lanes in Allure-like shape: `Setup`, `Test Body`, `Teardown`;
  - suite hooks are merged into setup/teardown flow;
  - test metadata header (`id`, `description`, `tags`);
  - expanded `use.action` and `use.ref` steps;
  - schema links from `assert.type: schema`;
  - unresolved reference warnings (`imports/action/ref/schema`) with direct links.

## Reports UX (Phase D baseline)

- Primary flow is `Run Test` / `Run Suite` -> reports are produced during `speq run`.
- Home shows latest summary status and topology metrics.
- Report commands from Home:
  - open `reports/results/summary.json`;
  - open allure directory in OS explorer;
  - run `allure serve`.
- Advanced commands (`Generate Report`, `Report All`) remain available from Command Palette for manual recovery flows.
- Home refreshes after run/report commands to keep report status up to date.

## Local development

- Install dependencies: `npm install`
- Compile: `npm run compile`

## Release

- Release instructions (manual + GitHub automation): `docs/EXTENSION_RELEASE_GUIDE.md`

## Status

OSS MVP extension is implemented as interface-only layer over `speq-cli`.
