import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SpeqRootInfo } from "./types";

function isValidSpeqLayout(root: string): boolean {
  return fs.existsSync(path.join(root, "manifest.yaml")) && fs.existsSync(path.join(root, "suites"));
}

export function resolveSpeqRoot(workspaceFolder: vscode.WorkspaceFolder): SpeqRootInfo | undefined {
  const workspacePath = workspaceFolder.uri.fsPath;
  const inRepoRoot = path.join(workspacePath, ".speq");

  if (isValidSpeqLayout(inRepoRoot)) {
    return {
      workspaceFolder,
      mode: "in-repo",
      speqRoot: inRepoRoot,
      suitesDir: path.join(inRepoRoot, "suites"),
      manifestPath: path.join(inRepoRoot, "manifest.yaml"),
      environmentsDir: path.join(inRepoRoot, "environments")
    };
  }

  if (isValidSpeqLayout(workspacePath)) {
    return {
      workspaceFolder,
      mode: "test-repo",
      speqRoot: workspacePath,
      suitesDir: path.join(workspacePath, "suites"),
      manifestPath: path.join(workspacePath, "manifest.yaml"),
      environmentsDir: path.join(workspacePath, "environments")
    };
  }

  return undefined;
}

export function getPrimarySpeqRoot(): SpeqRootInfo | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const resolved = resolveSpeqRoot(folder);
    if (resolved) {
      return resolved;
    }
  }
  return undefined;
}
