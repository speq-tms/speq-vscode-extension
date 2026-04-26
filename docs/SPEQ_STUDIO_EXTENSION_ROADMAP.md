# SPEQ Studio in VS Code: Product Roadmap

This document defines the target evolution of `speq-vscode-extension` into **SPEQ Studio**: a practical wrapper for enterprise-scale declarative testing where users can quickly orient in test space and operate without deep YAML navigation.

## Product Goal

When user opens the `speq` activity view, they should immediately understand:

- what test topology exists (suites/tests/init/hooks);
- what reusable assets exist (modules/schemas/env);
- what is currently broken (validation issues, unresolved links);
- what was executed recently (reports and status);
- how to run and inspect flows with minimal context switching.

## Core UX Principles

- **Orientation first**: surface structure and dependencies before file-level edits.
- **Declarative visibility**: visualize step flows, imports, module action expansions, schema links.
- **Action from context**: run/validate/report actions must be available from panel and in-file UI.
- **Progressive detail**: summary at top-level, drilldown on demand.
- **CLI parity**: extension remains a wrapper over `speq-cli`, including local cargo mode for fast iteration.

## Target Studio Capabilities

### 1. Studio Navigation Layer

- Unified workspace map: suites/tests/init + modules + schemas + environments + reports.
- Dependency edges:
  - test -> module action;
  - test/assert schema -> schema file;
  - suite init hooks -> tests in suite.
- Broken reference detection in navigation.

### 2. Flow Visualization Layer

- Test flow diagram for selected test:
  - `setup -> steps -> cleanup`;
  - expansion for `use.ref` and `use.action`;
  - optional inclusion of inherited `init.yaml` hooks.
- Click-through from diagram node to source YAML.

### 3. Execution & Report Layer

- Context run/validate actions from tree, file, and diagram nodes.
- Report center:
  - summary stats, last run metadata;
  - open summary/allure files;
  - `allure serve` command from extension.

### 4. In-File Productivity Layer

- CodeLens for `Run Test`, `Run Suite`, `Validate`.
- Rich diagnostics + quick fixes.
- DSL-aware completion/hover/signature help where applicable.

## Delivery Plan

## Phase A (Now): Studio Entry Point

Purpose: immediately improve orientation in large repos.

- Add `Studio Map` view with top-level categories:
  - suites/tests/init;
  - modules;
  - schemas;
  - environments;
  - reports.
- Show count metadata where possible.
- Keep click-to-open behavior for files.

Acceptance:

- Opening `speq` panel gives full test-space overview in one place.
- User can navigate to core assets without searching file explorer.

## Phase B: Actionable Context

- Add context actions for map nodes (validate/run/open report).
- Add file-level CodeLens run/validate.
- Add current-file and current-suite validate commands.

Acceptance:

- Main workflows are available without leaving editor/panel context.

## Phase C: Visual Test Graph

- Implement graph webview for selected test.
- Resolve module action links and show expanded steps.
- Show schema dependencies in graph nodes.

Acceptance:

- User can inspect execution intent without reading full YAML chain.

## Phase D: Report Experience

- `allure serve` command with output channel integration.
- Report summary panel and quick links.
- Optional run history snapshots.

Acceptance:

- User can open and inspect report artifacts from extension in one flow.

## Phase E: Studio-Grade Intelligence

- Project indexing service with dependency graph cache.
- Broken-reference badges and impact tracing.
- Optional architecture-level views (domain/service/test coverage map).

Acceptance:

- Extension provides near “control-plane” experience for declarative tests.

## Technical Architecture Direction

- Keep extension runtime as orchestration shell over `speq-cli`.
- Introduce lightweight indexing layer in extension:
  - fs scan + yaml parse + dependency extraction;
  - incremental cache invalidation on save.
- Keep rendering adapters independent:
  - tree provider (navigation);
  - webview graph (visualization);
  - report widgets.

## Risks and Mitigations

- YAML parsing cost on big repos -> incremental index + debounce.
- Graph complexity for deeply nested reusables -> depth limits + user toggle.
- CLI/report version mismatch -> capability checks and graceful fallbacks.
- Enterprise scale discoverability -> prioritize overview + filters early.

## Definition of Done for "Studio Baseline"

- User opens `speq` activity and can orient quickly in project topology.
- User can run/validate from contextual entry points.
- User can inspect at least one visual flow representation.
- User can open report artifacts and start Allure serve flow from extension.
