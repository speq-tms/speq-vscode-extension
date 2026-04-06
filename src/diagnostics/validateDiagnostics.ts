import * as path from "path";
import * as vscode from "vscode";
import { runSpeq } from "../cli";
import { SpeqRootInfo, ValidateJsonPayload } from "../types";

const FILE_PATH_PATTERN = / in (.+?\.(?:ya?ml))(?:$|:| step\[)/;
const LINE_PATTERN = /line (\d+)/;

function createDiagnostic(message: string): vscode.Diagnostic {
  const lineMatch = message.match(LINE_PATTERN);
  const line = lineMatch ? Math.max(0, Number(lineMatch[1]) - 1) : 0;
  const range = new vscode.Range(line, 0, line, 200);
  return new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
}

function resolveUriForError(errorMessage: string, root: SpeqRootInfo): vscode.Uri {
  const filePathMatch = errorMessage.match(FILE_PATH_PATTERN);
  if (!filePathMatch || !filePathMatch[1]) {
    return vscode.Uri.file(root.manifestPath);
  }

  const filePath = filePathMatch[1];
  if (path.isAbsolute(filePath)) {
    return vscode.Uri.file(filePath);
  }

  return vscode.Uri.file(path.resolve(root.speqRoot, filePath));
}

function parseValidatePayload(rawText: string): ValidateJsonPayload | undefined {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as ValidateJsonPayload;
  } catch {
    return undefined;
  }
}

export async function refreshValidateDiagnostics(
  root: SpeqRootInfo,
  collection: vscode.DiagnosticCollection,
  output: vscode.OutputChannel
): Promise<void> {
  const result = await runSpeq(["validate", "--speq-root", root.speqRoot, "--format", "json"], root.workspaceFolder.uri.fsPath);
  const payload = parseValidatePayload(result.stdout) ?? parseValidatePayload(result.stderr);

  collection.clear();

  if (!payload) {
    output.appendLine("speq validate did not return JSON payload. stderr:");
    output.appendLine(result.stderr || "(empty)");
    if (result.exitCode !== 0) {
      vscode.window.showErrorMessage("speq validate failed: see 'speq' output channel.");
    }
    return;
  }

  const errors = payload.errors ?? [];
  if (errors.length === 0) {
    vscode.window.setStatusBarMessage("speq validate: no issues", 3000);
    return;
  }

  const byUri = new Map<string, vscode.Diagnostic[]>();
  for (const message of errors) {
    const uri = resolveUriForError(message, root);
    const key = uri.toString();
    const existing = byUri.get(key) ?? [];
    existing.push(createDiagnostic(message));
    byUri.set(key, existing);
  }

  for (const [key, diagnostics] of byUri.entries()) {
    collection.set(vscode.Uri.parse(key), diagnostics);
  }

  vscode.window.showWarningMessage(`speq validate: found ${errors.length} issue(s).`);
}
