import * as path from "path";
import * as vscode from "vscode";
import { SpeqRootInfo } from "../types";
import { buildTestFlowGraphModel, TestFlowGraphModel } from "./testFlowGraph";

function titleFromPath(filePath: string): string {
  return `Test Flow: ${path.basename(filePath)}`;
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 16; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function getWebviewHtml(webview: vscode.Webview, scriptUri: vscode.Uri, nonce: string, model: TestFlowGraphModel): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SPEQ Test Flow</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">window.__SPEQ_TEST_FLOW__ = ${JSON.stringify(model)};</script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}

export async function openTestFlowWebview(
  extensionUri: vscode.Uri,
  root: SpeqRootInfo,
  testPath: string,
  output: vscode.OutputChannel
): Promise<void> {
  try {
    const model = buildTestFlowGraphModel(root, testPath);
    const panel = vscode.window.createWebviewPanel(
      "speqTestFlow",
      titleFromPath(model.testPath),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist", "webviews")]
      }
    );
    const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webviews", "testFlow.js"));
    const nonce = createNonce();
    panel.webview.html = getWebviewHtml(panel.webview, scriptUri, nonce, model);
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message?.type !== "openFile" || typeof message.path !== "string" || !message.path.trim()) {
        return;
      }
      const uri = vscode.Uri.file(message.path);
      await vscode.window.showTextDocument(uri, { preview: false });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`test flow build error: ${message}`);
    vscode.window.showErrorMessage(`Failed to open test flow: ${message}`);
  }
}
