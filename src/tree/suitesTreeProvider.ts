import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SpeqRootInfo } from "../types";

export interface SuiteTreeItem extends vscode.TreeItem {
  fullPath: string;
  kind: "suite" | "test";
}

function isYaml(fileName: string): boolean {
  return fileName.endsWith(".yaml") || fileName.endsWith(".yml");
}

function buildItems(dirPath: string): SuiteTreeItem[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const items: SuiteTreeItem[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const treeItem = new vscode.TreeItem(entry.name, vscode.TreeItemCollapsibleState.Collapsed) as SuiteTreeItem;
      treeItem.fullPath = fullPath;
      treeItem.kind = "suite";
      treeItem.contextValue = "speqSuite";
      items.push(treeItem);
      continue;
    }

    if (entry.isFile() && isYaml(entry.name)) {
      const testItem = new vscode.TreeItem(entry.name, vscode.TreeItemCollapsibleState.None) as SuiteTreeItem;
      testItem.fullPath = fullPath;
      testItem.kind = "test";
      testItem.contextValue = "speqTest";
      testItem.command = {
        command: "vscode.open",
        title: "Open test",
        arguments: [vscode.Uri.file(fullPath)]
      };
      items.push(testItem);
    }
  }

  return items;
}

export class SuitesTreeProvider implements vscode.TreeDataProvider<SuiteTreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<SuiteTreeItem | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly resolveRoot: () => SpeqRootInfo | undefined) {}

  refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(element: SuiteTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SuiteTreeItem): vscode.ProviderResult<SuiteTreeItem[]> {
    const root = this.resolveRoot();
    if (!root) {
      return [];
    }

    if (!element) {
      return buildItems(root.suitesDir);
    }

    if (element.kind === "suite") {
      return buildItems(element.fullPath);
    }

    return [];
  }
}
