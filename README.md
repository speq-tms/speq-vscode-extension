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

## Planned structure

```text
src/
  extension.ts
  tree/
  preview/
  diagnostics/
syntaxes/
docs/
```

## Status

Bootstrap complete. Ready for MVP implementation.
