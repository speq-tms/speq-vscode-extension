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

function withEnv(args: string[], envName?: string): string[] {
  if (!envName || !envName.trim()) {
    return args;
  }
  return [...args, "--env", envName.trim()];
}

export interface RunCustomOptions {
  envName?: string;
  report?: "all" | "summary" | "allure";
  tags?: string[];
  suitePath?: string;
  testPath?: string;
}

export interface RunExecutionResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function appendOptionalRunOptions(args: string[], options: RunCustomOptions): string[] {
  const next = [...args];
  if (options.report) {
    next.push("--report", options.report);
  }
  if (options.tags && options.tags.length > 0) {
    next.push("--tags", options.tags.join(","));
  }
  return next;
}

async function executeRun(
  root: SpeqRootInfo,
  output: vscode.OutputChannel,
  args: string[],
  successMessage: string,
  failurePrefix: string
): Promise<RunExecutionResult> {
  const startedAt = Date.now();
  const result = await runSpeq(args, root.workspaceFolder.uri.fsPath);
  const durationMs = Date.now() - startedAt;
  output.appendLine(`$ ${result.command}`);
  if (result.stdout.trim()) {
    output.appendLine(result.stdout.trim());
  }
  if (result.stderr.trim()) {
    output.appendLine(result.stderr.trim());
  }

  if (result.exitCode === 0) {
    vscode.window.showInformationMessage(successMessage);
  } else {
    const details = result.stderr || result.stdout || "Unknown error";
    vscode.window.showErrorMessage(`${failurePrefix}: ${details}`);
  }

  return {
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs
  };
}

export async function runSuite(
  root: SpeqRootInfo,
  output: vscode.OutputChannel,
  suitePath?: string,
  envName?: string
): Promise<RunExecutionResult> {
  let selectedSuite = suitePath;
  if (!selectedSuite) {
    selectedSuite = root.suitesDir;
  }

  const args = withEnv(["run", "--speq-root", root.speqRoot, "--suite", relativeToRoot(selectedSuite, root)], envName);
  return executeRun(root, output, args, "speq suite run completed.", "speq suite run failed");
}

export async function runTest(
  root: SpeqRootInfo,
  output: vscode.OutputChannel,
  testPath?: string,
  envName?: string
): Promise<RunExecutionResult | undefined> {
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

  const args = withEnv(["run", "--speq-root", root.speqRoot, "--test", relativeToRoot(selectedTest, root)], envName);
  return executeRun(root, output, args, "speq test run completed.", "speq test run failed");
}

export async function runCustom(root: SpeqRootInfo, output: vscode.OutputChannel, options: RunCustomOptions): Promise<RunExecutionResult> {
  const args: string[] = ["run", "--speq-root", root.speqRoot];

  if (options.testPath) {
    args.push("--test", relativeToRoot(options.testPath, root));
  } else if (options.suitePath) {
    args.push("--suite", relativeToRoot(options.suitePath, root));
  }

  const withEnvArgs = withEnv(args, options.envName);
  const finalArgs = appendOptionalRunOptions(withEnvArgs, options);
  return executeRun(root, output, finalArgs, "speq run completed.", "speq run failed");
}
