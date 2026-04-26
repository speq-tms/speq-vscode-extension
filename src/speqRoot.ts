import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SpeqRootInfo } from "./types";

let activeRootWorkspaceUri: string | undefined;

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
      environmentsDir: path.join(inRepoRoot, "environments"),
      modulesDir: path.join(inRepoRoot, "modules"),
      schemasDir: path.join(inRepoRoot, "schemas")
    };
  }

  if (isValidSpeqLayout(workspacePath)) {
    return {
      workspaceFolder,
      mode: "test-repo",
      speqRoot: workspacePath,
      suitesDir: path.join(workspacePath, "suites"),
      manifestPath: path.join(workspacePath, "manifest.yaml"),
      environmentsDir: path.join(workspacePath, "environments"),
      modulesDir: path.join(workspacePath, "modules"),
      schemasDir: path.join(workspacePath, "schemas")
    };
  }

  return undefined;
}

export function getPrimarySpeqRoot(): SpeqRootInfo | undefined {
  return getActiveSpeqRoot();
}

export function getSpeqRoots(): SpeqRootInfo[] {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const roots: SpeqRootInfo[] = [];
  for (const folder of folders) {
    const resolved = resolveSpeqRoot(folder);
    if (resolved) {
      roots.push(resolved);
    }
  }
  return roots;
}

export function getActiveSpeqRoot(): SpeqRootInfo | undefined {
  const roots = getSpeqRoots();
  if (roots.length === 0) {
    return undefined;
  }

  if (activeRootWorkspaceUri) {
    const selected = roots.find((root) => root.workspaceFolder.uri.toString() === activeRootWorkspaceUri);
    if (selected) {
      return selected;
    }
  }

  activeRootWorkspaceUri = roots[0].workspaceFolder.uri.toString();
  return roots[0];
}

export function setActiveSpeqRoot(workspaceFolderUri: string): void {
  activeRootWorkspaceUri = workspaceFolderUri;
}
