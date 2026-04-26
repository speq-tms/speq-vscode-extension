import * as vscode from "vscode";

export type SpeqMode = "in-repo" | "test-repo";

export interface SpeqRootInfo {
  workspaceFolder: vscode.WorkspaceFolder;
  mode: SpeqMode;
  speqRoot: string;
  suitesDir: string;
  manifestPath: string;
  environmentsDir: string;
  modulesDir: string;
  schemasDir: string;
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;
}

export interface ValidateIssue {
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
}

export interface ValidateJsonPayload {
  ok?: boolean;
  errors?: string[];
  issues?: ValidateIssue[];
}
