import * as path from "path";
import * as vscode from "vscode";
import { SpeqRootInfo } from "../types";

function isYaml(filePath: string): boolean {
  return filePath.endsWith(".yaml") || filePath.endsWith(".yml");
}

function isUnder(targetPath: string, parentDir: string): boolean {
  return targetPath.startsWith(parentDir + path.sep) || targetPath === parentDir;
}

function isSuiteInit(filePath: string): boolean {
  const base = path.basename(filePath);
  return base === "init.yaml" || base === "init.yml";
}

export class SpeqCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private readonly resolveRoot: () => SpeqRootInfo | undefined) {}

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const root = this.resolveRoot();
    if (!root) {
      return [];
    }

    const filePath = document.uri.fsPath;
    if (!isYaml(filePath) || !isUnder(filePath, root.speqRoot)) {
      return [];
    }

    const firstLine = new vscode.Range(0, 0, 0, 0);
    const lenses: vscode.CodeLens[] = [];

    if (isUnder(filePath, root.suitesDir)) {
      if (isSuiteInit(filePath)) {
        lenses.push(
          new vscode.CodeLens(firstLine, {
            title: "Run Suite",
            command: "speq.runSuiteAtPath",
            arguments: [document.uri]
          })
        );
      } else {
        lenses.push(
          new vscode.CodeLens(firstLine, {
            title: "Run Test",
            command: "speq.runTestAtPath",
            arguments: [document.uri]
          }),
          new vscode.CodeLens(firstLine, {
            title: "Open Test Flow",
            command: "speq.openTestFlowAtPath",
            arguments: [document.uri]
          }),
          new vscode.CodeLens(firstLine, {
            title: "Run Suite",
            command: "speq.runSuiteAtPath",
            arguments: [document.uri]
          })
        );
      }
    }

    lenses.push(
      new vscode.CodeLens(firstLine, {
        title: "Validate Workspace",
        command: "speq.validateWorkspace"
      })
    );

    return lenses;
  }
}
