# SPEQ Studio — Next Agent Handoff

## Current State (Done)

- Sidebar UX was simplified to a single React webview: `Studio Home`.
- `Quick Actions` block was removed from Home.
- Home now keeps only `Refresh` as a header icon action.
- Active environment selector is available in Home and stored per `speqRoot`.
- Runner block exists in Home and builds `speq run` arguments:
  - target: `all | suite | test`
  - report mode: `all | summary | allure`
  - tags: comma-separated
  - env: selected active environment
- Running from Home executes CLI through extension runtime and writes command/output to `speq` channel.
- Latest summary/topology remain visible in Home.
- Studio webview now has tabbed UX in one React view:
  - `Home`
  - `Tree View`
  - `Runner`
  - `Results`
- `Tree View` shows suites/tests/init hierarchy and supports per-node actions:
  - prefill runner for suite/test run
  - open test flow for test nodes
  - open source file
  - search/filter by suite/test path
  - compact row-based layout for deep nesting
  - folders collapsed by default
  - `Expand all` / `Collapse all` controls
  - tree info strip with total vs visible counters
- `Runner` is now a dedicated tab:
  - receives prefilled config from Tree View actions
  - runs via `speq.runFromStudioHome`
  - includes terminal-like debug log with command, exit code, duration, stdout/stderr
- `Results` is now a dedicated tab with:
  - latest summary snapshot
  - open summary JSON action
  - open allure dir action
  - allure serve action
  - failed tests list from summary with:
    - filter by id/message/path
    - open file / open flow (best effort id->file resolve)
    - prefill runner from resolved test

## Agreed Next Steps

### 1) Tree View Enhancements

- Add badges for unresolved refs / validation issues.

### 2) Runner Enhancements

- Add richer run metadata in log (start timestamp, active env, selected target).
- Add quick rerun action for latest config.

### 3) Results Enhancements

- Add optional recent run history cards.

## Implementation Notes

- Keep repository-native workflow untouched (git diff, file open, editor integration).
- Keep CLI as single execution backend (`speq` / `cargo run -- ...` modes).
- Prefer shared Studio state across tabs (active root, env, run inputs, latest summary).
