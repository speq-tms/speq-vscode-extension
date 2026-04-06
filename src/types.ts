import * as vscode from "vscode";

export type SpeqMode = "in-repo" | "test-repo";

export interface SpeqRootInfo {
  workspaceFolder: vscode.WorkspaceFolder;
  mode: SpeqMode;
  speqRoot: string;
  suitesDir: string;
  manifestPath: string;
  environmentsDir: string;
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ValidateJsonPayload {
  ok?: boolean;
  errors?: string[];
}
