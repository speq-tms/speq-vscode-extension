import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { runSpeq } from "./cli";
import { SpeqRootInfo } from "./types";

function resolveAllureDir(root: SpeqRootInfo, explicitPath?: string): string {
  if (explicitPath && fs.existsSync(explicitPath) && fs.statSync(explicitPath).isDirectory()) {
    return explicitPath;
  }
  return path.join(root.speqRoot, "reports", "allure");
}

function resolveSummaryPath(root: SpeqRootInfo, explicitPath?: string): string {
  if (explicitPath && fs.existsSync(explicitPath) && fs.statSync(explicitPath).isFile()) {
    return explicitPath;
  }
  return path.join(root.speqRoot, "reports", "results", "summary.json");
}

export async function serveAllureReport(root: SpeqRootInfo, output: vscode.OutputChannel, explicitPath?: string): Promise<void> {
  const allureDir = resolveAllureDir(root, explicitPath);
  if (!fs.existsSync(allureDir)) {
    vscode.window.showErrorMessage(`Allure report directory not found: ${allureDir}`);
    return;
  }

  const args = ["serve", allureDir];
  const command = `allure ${args.join(" ")}`;
  output.appendLine(`$ ${command}`);

  const child = spawn("allure", args, { cwd: root.speqRoot });
  child.stdout.on("data", (chunk: Buffer) => {
    output.append(chunk.toString());
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output.append(chunk.toString());
  });
  child.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`allure serve error: ${message}`);
    vscode.window.showErrorMessage("Failed to start allure. Ensure allure CLI is installed and available in PATH.");
  });
  child.on("spawn", () => {
    vscode.window.showInformationMessage("Allure serve started. Check 'speq' output for URL.");
  });
}

export async function generateReport(
  root: SpeqRootInfo,
  output: vscode.OutputChannel,
  format: "all" | "summary" | "allure"
): Promise<void> {
  const args = ["report", "--speq-root", root.speqRoot, "--format", format];
  const result = await runSpeq(args, root.workspaceFolder.uri.fsPath);
  output.appendLine(`$ ${result.command}`);
  if (result.stdout.trim()) {
    output.appendLine(result.stdout.trim());
  }
  if (result.stderr.trim()) {
    output.appendLine(result.stderr.trim());
  }

  if (result.exitCode !== 0) {
    const details = result.stderr || result.stdout || "Unknown error";
    vscode.window.showErrorMessage(`speq report failed: ${details}`);
    return;
  }

  vscode.window.showInformationMessage(`speq report generated (${format}).`);
}

export async function promptAndGenerateReport(root: SpeqRootInfo, output: vscode.OutputChannel): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: "all", description: "summary + allure artifacts", format: "all" as const },
      { label: "summary", description: "summary.json only", format: "summary" as const },
      { label: "allure", description: "allure artifacts only", format: "allure" as const }
    ],
    {
      placeHolder: "Select report format"
    }
  );
  if (!picked) {
    return;
  }
  await generateReport(root, output, picked.format);
}

export async function openSummaryReport(root: SpeqRootInfo, explicitPath?: string): Promise<void> {
  const summaryPath = resolveSummaryPath(root, explicitPath);
  if (!fs.existsSync(summaryPath)) {
    vscode.window.showErrorMessage(`Summary report not found: ${summaryPath}`);
    return;
  }
  await vscode.window.showTextDocument(vscode.Uri.file(summaryPath), { preview: false });
}

export async function openAllureDirectory(root: SpeqRootInfo, explicitPath?: string): Promise<void> {
  const allureDir = resolveAllureDir(root, explicitPath);
  if (!fs.existsSync(allureDir)) {
    vscode.window.showErrorMessage(`Allure report directory not found: ${allureDir}`);
    return;
  }
  await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(allureDir));
}
