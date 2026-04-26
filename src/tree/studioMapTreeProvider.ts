import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SpeqRootInfo } from "../types";

type StudioNodeKind = "category" | "dir" | "file";

export interface StudioTreeItem extends vscode.TreeItem {
  kind: StudioNodeKind;
  fullPath?: string;
  categoryName?: string;
}

interface CategoryConfig {
  id: string;
  label: string;
  description: string;
  folderPath: (root: SpeqRootInfo) => string;
}

interface SummaryTotals {
  total?: number;
  passed?: number;
  failed?: number;
}

interface SummaryPayload {
  status?: string;
  durationMs?: number;
  totals?: SummaryTotals;
}

function readSummaryPayload(summaryPath: string): SummaryPayload | undefined {
  if (!fs.existsSync(summaryPath)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(summaryPath, "utf8")) as SummaryPayload;
  } catch {
    return undefined;
  }
}

const CATEGORIES: CategoryConfig[] = [
  {
    id: "suites",
    label: "Suites",
    description: "tests and init hooks",
    folderPath: (root) => root.suitesDir
  },
  {
    id: "modules",
    label: "Modules",
    description: "reusable actions",
    folderPath: (root) => root.modulesDir
  },
  {
    id: "schemas",
    label: "Schemas",
    description: "assert contracts",
    folderPath: (root) => root.schemasDir
  },
  {
    id: "environments",
    label: "Environments",
    description: "runtime env configs",
    folderPath: (root) => root.environmentsDir
  },
  {
    id: "reports",
    label: "Reports",
    description: "execution artifacts",
    folderPath: (root) => path.join(root.speqRoot, "reports")
  }
];

function isYaml(fileName: string): boolean {
  return fileName.endsWith(".yaml") || fileName.endsWith(".yml");
}

function isSchema(fileName: string): boolean {
  return fileName.endsWith(".json") || isYaml(fileName);
}

function countSuiteAssets(baseDir: string): { tests: number; initFiles: number } {
  const counters = { tests: 0, initFiles: 0 };
  if (!fs.existsSync(baseDir)) {
    return counters;
  }

  const stack = [baseDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && isYaml(entry.name)) {
        if (entry.name === "init.yaml" || entry.name === "init.yml") {
          counters.initFiles += 1;
        } else {
          counters.tests += 1;
        }
      }
    }
  }

  return counters;
}

function countByPredicate(baseDir: string, predicate: (fileName: string) => boolean): number {
  if (!fs.existsSync(baseDir)) {
    return 0;
  }
  let count = 0;
  const stack = [baseDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && predicate(entry.name)) {
        count += 1;
      }
    }
  }
  return count;
}

function categoryDescription(categoryId: string, folderPath: string): string {
  if (!fs.existsSync(folderPath)) {
    return "not found";
  }
  if (categoryId === "suites") {
    const counters = countSuiteAssets(folderPath);
    return `${counters.tests} tests, ${counters.initFiles} init`;
  }
  if (categoryId === "modules") {
    return `${countByPredicate(folderPath, isYaml)} files`;
  }
  if (categoryId === "schemas") {
    return `${countByPredicate(folderPath, isSchema)} files`;
  }
  if (categoryId === "environments") {
    return `${countByPredicate(folderPath, isYaml)} files`;
  }
  if (categoryId === "reports") {
    const summaryPath = path.join(folderPath, "results", "summary.json");
    const parsed = readSummaryPayload(summaryPath);
    if (parsed) {
      const status = parsed.status ?? "unknown";
      const total = parsed.totals?.total ?? 0;
      const passed = parsed.totals?.passed ?? 0;
      const failed = parsed.totals?.failed ?? 0;
      return `${status}: ${passed}/${total} passed, ${failed} failed`;
    }
    return `${countByPredicate(folderPath, () => true)} files`;
  }
  return "";
}

function createCategoryItems(root: SpeqRootInfo): StudioTreeItem[] {
  return CATEGORIES.map((category) => {
    const categoryPath = category.folderPath(root);
    const item = new vscode.TreeItem(category.label, vscode.TreeItemCollapsibleState.Collapsed) as StudioTreeItem;
    item.kind = "category";
    item.categoryName = category.id;
    item.fullPath = categoryPath;
    const categoryContext = {
      suites: "speqStudioCategorySuites",
      modules: "speqStudioCategoryModules",
      schemas: "speqStudioCategorySchemas",
      environments: "speqStudioCategoryEnvironments",
      reports: "speqStudioCategoryReports"
    }[category.id] ?? "speqStudioCategory";
    item.contextValue = categoryContext;
    item.description = categoryDescription(category.id, categoryPath);
    item.tooltip = `${category.description}: ${categoryPath}`;
    if (category.id === "reports") {
      const summaryPath = path.join(categoryPath, "results", "summary.json");
      const parsed = readSummaryPayload(summaryPath);
      if (parsed) {
        const status = parsed.status?.toLowerCase();
        const iconId = status === "passed" ? "pass-filled" : status === "failed" ? "error" : "history";
        item.iconPath = new vscode.ThemeIcon(iconId);
      } else {
        item.iconPath = new vscode.ThemeIcon("folder-library");
      }
    } else {
      item.iconPath = new vscode.ThemeIcon("folder-library");
    }
    return item;
  });
}

function createFileItem(fullPath: string, label: string): StudioTreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None) as StudioTreeItem;
  item.kind = "file";
  item.fullPath = fullPath;
  item.contextValue = "speqStudioFile";
  item.command = {
    command: "vscode.open",
    title: "Open file",
    arguments: [vscode.Uri.file(fullPath)]
  };
  item.iconPath = new vscode.ThemeIcon("file");
  return item;
}

function createDirectoryItem(fullPath: string, label: string): StudioTreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed) as StudioTreeItem;
  item.kind = "dir";
  item.fullPath = fullPath;
  item.contextValue = "speqStudioDir";
  item.iconPath = vscode.ThemeIcon.Folder;
  return item;
}

function fileContextValue(categoryName: string | undefined, fullPath: string, label: string): string {
  if (categoryName === "suites") {
    if (label === "init.yaml" || label === "init.yml") {
      return "speqStudioSuiteInitFile";
    }
    if (isYaml(label)) {
      return "speqStudioTestFile";
    }
  }
  if (categoryName === "reports" && label === "summary.json") {
    return "speqStudioSummaryFile";
  }
  if (categoryName === "reports" && (label.endsWith(".html") || label.endsWith(".htm"))) {
    return "speqStudioReportHtmlFile";
  }
  return "speqStudioFile";
}

function dirContextValue(categoryName: string | undefined, fullPath: string): string {
  if (categoryName === "suites") {
    return "speqStudioSuiteDir";
  }
  if (categoryName === "reports") {
    const normalized = fullPath.replace(/\\/g, "/");
    if (normalized.endsWith("/reports/allure") || normalized.includes("/reports/allure/")) {
      return "speqStudioAllureDir";
    }
  }
  return "speqStudioDir";
}

function buildDirectoryChildren(targetDir: string, categoryName?: string): StudioTreeItem[] {
  if (!fs.existsSync(targetDir)) {
    return [];
  }
  const entries = fs.readdirSync(targetDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const items: StudioTreeItem[] = [];
  if (categoryName === "reports") {
    const summaryPath = path.join(targetDir, "results", "summary.json");
    const summaryPayload = readSummaryPayload(summaryPath);
    if (summaryPayload) {
      const total = summaryPayload.totals?.total ?? 0;
      const passed = summaryPayload.totals?.passed ?? 0;
      const failed = summaryPayload.totals?.failed ?? 0;
      const status = summaryPayload.status ?? "unknown";
      const summaryItem = new vscode.TreeItem("Latest Summary", vscode.TreeItemCollapsibleState.None) as StudioTreeItem;
      summaryItem.kind = "file";
      summaryItem.categoryName = categoryName;
      summaryItem.fullPath = summaryPath;
      summaryItem.contextValue = "speqStudioLatestSummary";
      summaryItem.description = `${status} | ${passed}/${total} passed, ${failed} failed`;
      summaryItem.command = {
        command: "speq.openSummaryReport",
        title: "Open summary report",
        arguments: [summaryItem]
      };
      const statusIcon =
        status.toLowerCase() === "passed" ? "pass-filled" : status.toLowerCase() === "failed" ? "error" : "history";
      summaryItem.iconPath = new vscode.ThemeIcon(statusIcon);
      items.push(summaryItem);
    }
  }
  for (const entry of entries) {
    const fullPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      const dirItem = createDirectoryItem(fullPath, entry.name);
      dirItem.categoryName = categoryName;
      dirItem.contextValue = dirContextValue(categoryName, fullPath);
      items.push(dirItem);
    } else if (entry.isFile()) {
      const fileItem = createFileItem(fullPath, entry.name);
      fileItem.categoryName = categoryName;
      fileItem.contextValue = fileContextValue(categoryName, fullPath, entry.name);
      items.push(fileItem);
    }
  }
  return items;
}

export class StudioMapTreeProvider implements vscode.TreeDataProvider<StudioTreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<StudioTreeItem | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly resolveRoot: () => SpeqRootInfo | undefined) {}

  refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(element: StudioTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: StudioTreeItem): vscode.ProviderResult<StudioTreeItem[]> {
    const root = this.resolveRoot();
    if (!root) {
      return [];
    }
    if (!element) {
      return createCategoryItems(root);
    }
    if (element.kind === "category" || element.kind === "dir") {
      if (!element.fullPath) {
        return [];
      }
      const categoryName = element.kind === "category" ? element.categoryName : element.categoryName;
      return buildDirectoryChildren(element.fullPath, categoryName);
    }
    return [];
  }
}
