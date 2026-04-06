import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SpeqRootInfo } from "../types";

function listEnvironmentFiles(root: SpeqRootInfo): string[] {
  if (!fs.existsSync(root.environmentsDir)) {
    return [];
  }

  return fs
    .readdirSync(root.environmentsDir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .sort((a, b) => a.localeCompare(b));
}

export async function openManifestPreview(root: SpeqRootInfo): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(root.manifestPath));
  await vscode.window.showTextDocument(doc, { preview: true });
}

export async function openEnvironmentPreview(root: SpeqRootInfo): Promise<void> {
  const envFiles = listEnvironmentFiles(root);
  if (envFiles.length === 0) {
    vscode.window.showWarningMessage("No environment YAML files found.");
    return;
  }

  const selected = await vscode.window.showQuickPick(envFiles, {
    placeHolder: "Select environment to preview"
  });

  if (!selected) {
    return;
  }

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root.environmentsDir, selected)));
  await vscode.window.showTextDocument(doc, { preview: true });
}
