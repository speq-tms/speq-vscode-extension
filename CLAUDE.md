# speq-vscode-extension

VS Code extension for SPEQ authoring, diagnostics, and UX.

## Responsibilities
- Editor integration and diagnostics.
- User workflows for SPEQ projects inside VS Code.

## Commands
- `npm install`
- `npm run compile`
- `npm run check`

## Invariants
- No core runtime or execution business logic here.
- Keep diagnostics and schema expectations aligned with `speq-contracts`.
- CLI interactions should execute through `speq-cli` binary/runtime.
