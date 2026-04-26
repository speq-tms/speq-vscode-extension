# SPEQ VS Code Extension: DSL Alpha.2 Backlog

This document captures the current extension state and issue-ready tasks required to align `speq-vscode-extension` with new `speq-cli` DSL/runtime capabilities:

- `assert: schema` (`ref` / `inline`)
- `use action` + `imports`
- `use.properties` (per-call action parameters)
- `suite.imports` and `init.yaml` hooks semantics
- module action contract (`properties + steps`, with legacy fallback)

## Current Architecture (as-is)

- `src/extension.ts`
  - Registers commands (`validate`, `run`, tree refresh, preview).
  - Creates diagnostics collection.
  - No save watcher for auto-validation.
- `src/diagnostics/validateDiagnostics.ts`
  - Calls `speq validate --format json`.
  - Parses `errors[]` and maps diagnostics with regex by message text.
- `src/speqRoot.ts`
  - Detects speq root by `manifest.yaml` + `suites` presence.
- `src/tree/suitesTreeProvider.ts`
  - Builds suites tree from YAML files.
  - `init.yaml` is treated as regular test entry in view.
- `src/runActions.ts`
  - Executes `speq run --suite|--test`.
- `src/types.ts`
  - Minimal `validate` payload typing.
- `package.json`
  - Commands/views only.
  - No YAML schema binding / no language features for DSL.

## Supported Today

- Manual workspace validation via CLI command output.
- Diagnostics display for many parser/runtime errors.
- Running suites/tests from explorer.

## Main Gaps

- Diagnostics are tied to fragile regex over human-readable error strings.
- No editor-side DSL support (schema/completion/hover).
- No explicit `init.yaml` treatment in tree/UX.
- No auto-validation on save.
- No `action` and `properties` completion support.
- No multi-root selection workflow.

## Issue-Ready Backlog

### 1) P0 — Fix diagnostics mapping for all validate error formats

**Why**
- Some errors are attached to wrong file (fallback to `manifest.yaml`) and line 0.

**Scope**
- `src/diagnostics/validateDiagnostics.ts`

**Acceptance Criteria**
- Errors for `assert[...]`, `step[...]`, and `init.yaml` map to correct URI.
- If line info exists, diagnostic points to that line.

**Test Checklist**
- Invalid `schema` assertion (`type: schema` without `ref/inline`)
- Invalid assertion type in test file
- Invalid `suite.imports` in `init.yaml`

---

### 2) P1 — Add structured diagnostics contract in CLI JSON (CLI + extension sync)

**Why**
- Remove regex dependency from extension diagnostics.

**Scope**
- CLI validate JSON format + extension parser (`types.ts`, diagnostics mapper).

**Acceptance Criteria**
- Validate payload contains structured issues: `file`, `line`, `column`, `code`, `message`.
- Extension builds diagnostics directly from structured fields.

---

### 3) P1 — Add YAML schema support for test specs and `init.yaml`

**Why**
- Give immediate authoring feedback for new DSL fields.

**Scope**
- Add schema files and bind in extension config.

**Acceptance Criteria**
- Supports:
  - `assert.type = schema` + `ref|inline`
  - `use.action`, `use.ref`, `use.properties`
  - `imports` on test level
  - `suite.variables`, `suite.imports`, hooks in `init.yaml`
  - module action contract `properties + steps` and legacy list format

---

### 4) P1 — Auto-validate on save (debounced)

**Why**
- Validation should not require manual command each time.

**Scope**
- Add save listeners + debounce/cancel logic.

**Acceptance Criteria**
- Saving `*.yaml` under speq root triggers diagnostics refresh.
- No UI freezes under frequent saves.

---

### 5) P2 — Completion for `type`, `assert.type`, `action`, and `properties`

**Why**
- New DSL needs guided authoring to avoid syntax mismatch.

**Scope**
- Completion provider and/or schema-driven completions.

**Acceptance Criteria**
- Suggest `api|use` for step type.
- Suggest known assert types including `schema`.
- Suggest imported aliases/actions for `use.action`.
- Suggest property keys from action contract when available.

---

### 6) P2 — Hover docs for DSL contracts

**Why**
- Keep DSL rules visible in-editor without switching to docs.

**Scope**
- Hover provider or schema markdown descriptions.

**Acceptance Criteria**
- Hover text exists for:
  - `schema` assert contract
  - `use` contract (`ref`/`action`/`properties`)
  - `init.yaml` hook semantics

---

### 7) P2 — Distinguish `init.yaml` nodes in Suites Tree

**Why**
- `init.yaml` is suite configuration, not a normal test case.

**Scope**
- `src/tree/suitesTreeProvider.ts`, view item context/icon.

**Acceptance Criteria**
- `init.yaml`/`init.yml` shown as dedicated node type.
- Run actions are not misleading for suite init files.

---

### 8) P2 — Multi-root workspace support

**Why**
- Current behavior can pick only first discovered speq root.

**Scope**
- Root selection strategy in `speqRoot.ts` + command context.

**Acceptance Criteria**
- User can choose active speq root when multiple are present.
- Validate/run/tree operate on selected root.

## Risks & Dependencies

- Strong coupling to CLI error text until structured diagnostics are introduced.
- Extension behavior depends on local `speq` binary availability and version.
- YAML schema UX can depend on installed YAML tooling in VS Code.

## Suggested Execution Order

1. P0 diagnostics mapping fix
2. P1 structured diagnostics contract (with CLI)
3. P1 YAML schema binding
4. P1 auto-validate on save
5. P2 completion + hover
6. P2 tree `init.yaml` UX + multi-root improvements
