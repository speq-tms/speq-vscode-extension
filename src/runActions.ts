import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { runSpeq } from "./cli";
import { SpeqRootInfo } from "./types";

function isYaml(filePath: string): boolean {
  return filePath.endsWith(".yaml") || filePath.endsWith(".yml");
}

function collectYamlFiles(dir: string, result: string[]): void {
  if (!fs.existsSync(dir)) {
    return;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectYamlFiles(full, result);
    } else if (entry.isFile() && isYaml(full)) {
      result.push(full);
    }
  }
}

function relativeToRoot(targetPath: string, root: SpeqRootInfo): string {
  return path.relative(root.speqRoot, targetPath);
}

export async function runSuite(root: SpeqRootInfo, output: vscode.OutputChannel, suitePath?: string): Promise<void> {
  let selectedSuite = suitePath;
  if (!selectedSuite) {
    selectedSuite = root.suitesDir;
  }

  const args = ["run", "--speq-root", root.speqRoot, "--suite", relativeToRoot(selectedSuite, root)];
  const result = await runSpeq(args, root.workspaceFolder.uri.fsPath);
  output.appendLine(`$ speq ${args.join(" ")}`);
  if (result.stdout.trim()) {
    output.appendLine(result.stdout.trim());
  }
  if (result.stderr.trim()) {
    output.appendLine(result.stderr.trim());
  }

  if (result.exitCode === 0) {
    vscode.window.showInformationMessage("speq suite run completed.");
    return;
  }

  const details = result.stderr || result.stdout || "Unknown error";
  vscode.window.showErrorMessage(`speq suite run failed: ${details}`);
}

export async function runTest(root: SpeqRootInfo, output: vscode.OutputChannel, testPath?: string): Promise<void> {
  let selectedTest = testPath;
  if (!selectedTest) {
    const tests: string[] = [];
    collectYamlFiles(root.suitesDir, tests);
    tests.sort((a, b) => a.localeCompare(b));

    const picked = await vscode.window.showQuickPick(tests.map((file) => relativeToRoot(file, root)), {
      placeHolder: "Select test file to run"
    });
    if (!picked) {
      return;
    }
    selectedTest = path.join(root.speqRoot, picked);
  }

  const args = ["run", "--speq-root", root.speqRoot, "--test", relativeToRoot(selectedTest, root)];
  const result = await runSpeq(args, root.workspaceFolder.uri.fsPath);
  output.appendLine(`$ speq ${args.join(" ")}`);
  if (result.stdout.trim()) {
    output.appendLine(result.stdout.trim());
  }
  if (result.stderr.trim()) {
    output.appendLine(result.stderr.trim());
  }

  if (result.exitCode === 0) {
    vscode.window.showInformationMessage("speq test run completed.");
    return;
  }

  const details = result.stderr || result.stdout || "Unknown error";
  vscode.window.showErrorMessage(`speq test run failed: ${details}`);
}
