import * as vscode from "vscode";
import { refreshValidateDiagnostics } from "./diagnostics/validateDiagnostics";
import { openEnvironmentPreview, openManifestPreview } from "./preview/preview";
import { runSuite, runTest } from "./runActions";
import { getPrimarySpeqRoot } from "./speqRoot";
import { SuitesTreeProvider, SuiteTreeItem } from "./tree/suitesTreeProvider";

function requireRoot(): ReturnType<typeof getPrimarySpeqRoot> {
  const root = getPrimarySpeqRoot();
  if (!root) {
    vscode.window.showErrorMessage("speq root not found in current workspace.");
    return undefined;
  }
  return root;
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("speq");
  const diagnostics = vscode.languages.createDiagnosticCollection("speq");
  const treeProvider = new SuitesTreeProvider(() => getPrimarySpeqRoot());

  context.subscriptions.push(output, diagnostics);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("speqSuitesExplorer", treeProvider),
    vscode.commands.registerCommand("speq.refreshSuites", () => treeProvider.refresh()),
    vscode.commands.registerCommand("speq.validateWorkspace", async () => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      try {
        await refreshValidateDiagnostics(root, diagnostics, output);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`validate error: ${message}`);
        vscode.window.showErrorMessage(`speq validate failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand("speq.runSuite", async (item?: SuiteTreeItem) => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      try {
        await runSuite(root, output, item?.kind === "suite" ? item.fullPath : undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`run suite error: ${message}`);
        vscode.window.showErrorMessage(`speq run suite failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand("speq.runTest", async (item?: SuiteTreeItem) => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      try {
        await runTest(root, output, item?.kind === "test" ? item.fullPath : undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`run test error: ${message}`);
        vscode.window.showErrorMessage(`speq run test failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand("speq.previewManifest", async () => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      await openManifestPreview(root);
    }),
    vscode.commands.registerCommand("speq.previewEnvironment", async () => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      await openEnvironmentPreview(root);
    })
  );
}

export function deactivate(): void {
  // no-op
}
