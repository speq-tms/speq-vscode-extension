import * as path from "path";
import * as vscode from "vscode";
import { SpeqRootInfo } from "../types";
import { buildTestFlowGraphModel, FlowIssue, FlowStepNode, TestFlowGraphModel } from "./testFlowGraph";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function relativePath(filePath: string, model: TestFlowGraphModel): string {
  const rel = path.relative(model.rootPath, filePath);
  return rel && !rel.startsWith("..") ? rel : filePath;
}

function renderStep(node: FlowStepNode, model: TestFlowGraphModel): string {
  const sourceLabel = relativePath(node.sourcePath, model);
  const sourceKindLabel = {
    test: "test",
    suiteInit: "init",
    moduleAction: "module",
    reusable: "reusable"
  }[node.sourceKind];
  const schemaList = node.schemaRefs.length
    ? `<div class="meta-row">Schemas: ${node.schemaRefs
        .map(
          (schema) =>
            `<button class="link ${schema.exists ? "" : "missing"}" data-open="${escapeHtml(schema.path)}">${escapeHtml(
              `${schema.label} (${relativePath(schema.path, model)})${schema.exists ? "" : " [missing]"}`
            )}</button>`
        )
        .join(", ")}</div>`
    : "";
  const issueList = node.issues.length
    ? `<div class="step-issues">${node.issues.map((issue) => `<div>⚠ ${escapeHtml(issue)}</div>`).join("")}</div>`
    : "";

  const expanded = node.expandedSteps.length
    ? `<div class="expanded">
        <div class="expanded-title">Expanded flow</div>
        ${node.expandedSteps.map((item) => renderStep(item, model)).join("")}
      </div>`
    : "";

  return `<div class="step-card">
    <div class="step-head">
      <span class="step-type">${escapeHtml(node.stepType)}</span>
      <span class="source-kind">${escapeHtml(sourceKindLabel)}</span>
      <span class="step-name">${escapeHtml(node.title)}</span>
    </div>
    <div class="meta-row">
      Source:
      <button class="link" data-open="${escapeHtml(node.sourcePath)}">${escapeHtml(sourceLabel)}</button>
    </div>
    ${schemaList}
    ${issueList}
    ${expanded}
  </div>`;
}

function renderLane(title: string, nodes: FlowStepNode[], model: TestFlowGraphModel): string {
  const body = nodes.length
    ? nodes
        .map((node, index) => {
          const separator = index < nodes.length - 1 ? '<div class="arrow">↓</div>' : "";
          return `${renderStep(node, model)}${separator}`;
        })
        .join("")
    : '<div class="empty-lane">No steps</div>';

  return `<section class="lane">
    <h2>${escapeHtml(title)}</h2>
    ${body}
  </section>`;
}

function getWebviewHtml(model: TestFlowGraphModel): string {
  const imports = model.imports.length
    ? model.imports
        .map(
          (item) =>
            `<li><code>${escapeHtml(item.alias)}</code> -> ${escapeHtml(item.module)} <span class="import-source">(${item.source})</span></li>`
        )
        .join("")
    : "<li>No imports</li>";
  const issues = model.issues.length
    ? renderIssues(model.issues, model)
    : '<div class="ok-banner">No unresolved references were detected.</div>';
  const description = model.testDescription
    ? `<p><strong>Description:</strong> ${escapeHtml(model.testDescription)}</p>`
    : "";
  const tags = model.testTags.length
    ? `<p><strong>Tags:</strong> ${model.testTags.map((tag) => `<code>${escapeHtml(tag)}</code>`).join(" ")}</p>`
    : "<p><strong>Tags:</strong> none</p>";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SPEQ Test Flow</title>
    <style>
      body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-editor-foreground); }
      .header { margin-bottom: 16px; }
      .header h1 { margin: 0; font-size: 20px; }
      .header p { margin: 4px 0; color: var(--vscode-descriptionForeground); }
      .imports { margin: 0 0 16px 0; padding-left: 16px; }
      .lane { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 12px; margin-bottom: 16px; }
      .lane h2 { margin-top: 0; font-size: 16px; }
      .step-card { border-left: 4px solid var(--vscode-button-background); padding: 8px 10px; background: var(--vscode-editorWidget-background); border-radius: 4px; }
      .step-head { display: flex; gap: 8px; align-items: baseline; margin-bottom: 6px; }
      .step-type { font-size: 11px; text-transform: uppercase; color: var(--vscode-symbolIcon-classForeground); }
      .source-kind { font-size: 10px; text-transform: uppercase; border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 1px 6px; color: var(--vscode-descriptionForeground); }
      .step-name { font-weight: 600; }
      .meta-row { font-size: 12px; margin-top: 4px; color: var(--vscode-descriptionForeground); }
      .arrow { text-align: center; margin: 6px 0; color: var(--vscode-descriptionForeground); }
      .link { border: none; background: none; color: var(--vscode-textLink-foreground); padding: 0; cursor: pointer; font-size: 12px; text-align: left; }
      .link:hover { text-decoration: underline; }
      .link.missing { color: var(--vscode-testing-iconFailed); }
      .expanded { margin-top: 8px; margin-left: 10px; padding-left: 10px; border-left: 1px dashed var(--vscode-panel-border); }
      .expanded-title { font-size: 12px; margin-bottom: 6px; color: var(--vscode-descriptionForeground); }
      .empty-lane { color: var(--vscode-descriptionForeground); font-size: 13px; }
      .step-issues { margin-top: 6px; font-size: 12px; color: var(--vscode-testing-iconFailed); }
      .issues { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; margin-bottom: 16px; }
      .issues h2 { margin: 0 0 8px 0; font-size: 15px; }
      .issues ul { margin: 0; padding-left: 18px; }
      .issues li { margin-bottom: 4px; }
      .ok-banner { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; margin-bottom: 16px; color: var(--vscode-testing-iconPassed); }
      .import-source { color: var(--vscode-descriptionForeground); font-size: 12px; }
      code { font-family: var(--vscode-editor-font-family); }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>${escapeHtml(model.testTitle)}</h1>
      <p><strong>ID:</strong> ${escapeHtml(model.testId)}</p>
      <p><strong>File:</strong> ${escapeHtml(relativePath(model.testPath, model))}</p>
      ${description}
      ${tags}
    </div>
    <div>
      <strong>Imports</strong>
      <ul class="imports">${imports}</ul>
    </div>
    ${issues}
    ${renderLane("Setup", model.setupFlow, model)}
    ${renderLane("Test Body", model.testBodyFlow, model)}
    ${renderLane("Teardown", model.teardownFlow, model)}
    <script>
      const vscode = acquireVsCodeApi();
      for (const button of document.querySelectorAll("[data-open]")) {
        button.addEventListener("click", () => {
          vscode.postMessage({ type: "openFile", path: button.dataset.open });
        });
      }
    </script>
  </body>
</html>`;
}

function renderIssues(issues: FlowIssue[], model: TestFlowGraphModel): string {
  return `<section class="issues">
    <h2>Resolution Warnings</h2>
    <ul>
      ${issues
        .map((issue) => {
          const location = issue.path
            ? `<button class="link" data-open="${escapeHtml(issue.path)}">${escapeHtml(relativePath(issue.path, model))}</button>`
            : "unknown location";
          return `<li>${escapeHtml(issue.message)} <span>(${location})</span></li>`;
        })
        .join("")}
    </ul>
  </section>`;
}

function titleFromPath(filePath: string): string {
  return `Test Flow: ${path.basename(filePath)}`;
}

export async function openTestFlowWebview(
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
      { enableScripts: true }
    );
    panel.webview.html = getWebviewHtml(model);
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
