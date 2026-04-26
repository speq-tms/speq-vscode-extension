import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { parse } from "yaml";
import { RunExecutionResult } from "../runActions";
import { SpeqRootInfo } from "../types";

interface StudioHomeState {
  hasRoot: boolean;
  workspaceName: string;
  rootPath: string;
  mode: string;
  activeEnv: string;
  availableEnvs: string[];
  counts: {
    suites: number;
    tests: number;
    initFiles: number;
    modules: number;
    schemas: number;
    environments: number;
  };
  reports: {
    hasSummary: boolean;
    status: string;
    passed: number;
    failed: number;
    total: number;
    durationMs: number;
    hasAllureDir: boolean;
    failedTests: FailedTestSummary[];
  };
  runner: {
    suiteOptions: string[];
    testOptions: string[];
    tagOptions: string[];
  };
  tree: {
    suiteNodes: SuiteTreeNode[];
  };
}

interface SummaryPayload {
  status?: string;
  durationMs?: number;
  totals?: {
    total?: number;
    passed?: number;
    failed?: number;
  };
  tests?: SummaryTestPayload[];
}

interface ParsedTagsSpec {
  tags?: string[];
  markers?: string[];
}

interface ParsedTestSpec {
  id?: string;
}

interface SummaryTestPayload {
  id?: string;
  status?: string;
  message?: string;
  durationMs?: number;
}

interface FailedTestSummary {
  id: string;
  message: string;
  durationMs: number;
  relativePath?: string;
  fullPath?: string;
}

interface SuiteTreeNode {
  id: string;
  label: string;
  kind: "suite" | "test" | "init";
  relativePath: string;
  fullPath: string;
  children: SuiteTreeNode[];
}

function countFiles(baseDir: string, predicate: (name: string) => boolean): number {
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
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && predicate(entry.name)) {
        count += 1;
      }
    }
  }
  return count;
}

function countSuiteAssets(suitesDir: string): { suites: number; tests: number; initFiles: number } {
  if (!fs.existsSync(suitesDir)) {
    return { suites: 0, tests: 0, initFiles: 0 };
  }

  let suites = 0;
  let tests = 0;
  let initFiles = 0;
  const stack = [suitesDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        suites += 1;
        stack.push(full);
      } else if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        if (entry.name === "init.yaml" || entry.name === "init.yml") {
          initFiles += 1;
        } else {
          tests += 1;
        }
      }
    }
  }

  return { suites, tests, initFiles };
}

function readSummary(summaryPath: string): SummaryPayload | undefined {
  if (!fs.existsSync(summaryPath)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(summaryPath, "utf8")) as SummaryPayload;
  } catch {
    return undefined;
  }
}

function collectRunnerOptions(root: SpeqRootInfo): { suiteOptions: string[]; testOptions: string[]; tagOptions: string[] } {
  if (!fs.existsSync(root.suitesDir)) {
    return { suiteOptions: [], testOptions: [], tagOptions: [] };
  }

  const suites = new Set<string>();
  const tests = new Set<string>();
  const tags = new Set<string>();

  const stack = [root.suitesDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        const relSuite = path.relative(root.speqRoot, fullPath).replace(/\\/g, "/");
        if (relSuite) {
          suites.add(relSuite);
        }
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!(entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        continue;
      }
      if (entry.name === "init.yaml" || entry.name === "init.yml") {
        continue;
      }
      const relTest = path.relative(root.speqRoot, fullPath).replace(/\\/g, "/");
      tests.add(relTest);
      try {
        const parsed = parseYamlTags(fullPath);
        for (const tag of parsed) {
          tags.add(tag);
        }
      } catch {
        // Best effort only for Home suggestions.
      }
    }
  }

  return {
    suiteOptions: Array.from(suites).sort((a, b) => a.localeCompare(b)),
    testOptions: Array.from(tests).sort((a, b) => a.localeCompare(b)),
    tagOptions: Array.from(tags).sort((a, b) => a.localeCompare(b))
  };
}

function parseYamlTags(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf8");
  const parsed = parse(content) as ParsedTagsSpec;
  const values = parsed.tags?.length ? parsed.tags : parsed.markers ?? [];
  return values.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function buildSuiteNode(root: SpeqRootInfo, targetDir: string): SuiteTreeNode {
  const relativePath = path.relative(root.speqRoot, targetDir).replace(/\\/g, "/");
  const node: SuiteTreeNode = {
    id: `suite:${relativePath || "."}`,
    label: path.basename(targetDir),
    kind: "suite",
    relativePath,
    fullPath: targetDir,
    children: []
  };
  if (!fs.existsSync(targetDir)) {
    return node;
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const fullPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      node.children.push(buildSuiteNode(root, fullPath));
      continue;
    }
    if (!entry.isFile() || !(entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
      continue;
    }
    const rel = path.relative(root.speqRoot, fullPath).replace(/\\/g, "/");
    node.children.push({
      id: `${entry.name === "init.yaml" || entry.name === "init.yml" ? "init" : "test"}:${rel}`,
      label: entry.name,
      kind: entry.name === "init.yaml" || entry.name === "init.yml" ? "init" : "test",
      relativePath: rel,
      fullPath,
      children: []
    });
  }
  return node;
}

function buildSuiteTree(root: SpeqRootInfo): SuiteTreeNode[] {
  if (!fs.existsSync(root.suitesDir)) {
    return [];
  }
  const entries = fs.readdirSync(root.suitesDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const suiteNodes: SuiteTreeNode[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    suiteNodes.push(buildSuiteNode(root, path.join(root.suitesDir, entry.name)));
  }
  return suiteNodes;
}

function collectTestIdIndex(root: SpeqRootInfo): Map<string, string> {
  const index = new Map<string, string>();
  if (!fs.existsSync(root.suitesDir)) {
    return index;
  }

  const stack = [root.suitesDir];
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
        continue;
      }
      if (!entry.isFile() || !(entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        continue;
      }
      if (entry.name === "init.yaml" || entry.name === "init.yml") {
        continue;
      }
      try {
        const parsed = parse(fs.readFileSync(fullPath, "utf8")) as ParsedTestSpec;
        const testId = typeof parsed.id === "string" ? parsed.id.trim() : "";
        if (!testId) {
          continue;
        }
        const relativePath = path.relative(root.speqRoot, fullPath).replace(/\\/g, "/");
        index.set(testId, relativePath);
      } catch {
        // best effort only for linking summary test id to source file
      }
    }
  }

  return index;
}

function buildFailedTests(summary: SummaryPayload | undefined, root: SpeqRootInfo): FailedTestSummary[] {
  if (!summary?.tests?.length) {
    return [];
  }
  const idIndex = collectTestIdIndex(root);
  const failed = summary.tests
    .filter((test) => typeof test.id === "string" && test.id.trim().length > 0 && String(test.status).toLowerCase() === "failed")
    .map((test) => {
      const id = (test.id ?? "").trim();
      const relativePath = idIndex.get(id);
      return {
        id,
        message: typeof test.message === "string" && test.message.trim().length > 0 ? test.message.trim() : "No error message.",
        durationMs: typeof test.durationMs === "number" ? test.durationMs : 0,
        relativePath,
        fullPath: relativePath ? path.join(root.speqRoot, relativePath) : undefined
      };
    });
  failed.sort((a, b) => a.id.localeCompare(b.id));
  return failed;
}

function buildState(root: SpeqRootInfo | undefined): StudioHomeState {
  if (!root) {
    return {
      hasRoot: false,
      workspaceName: "",
      rootPath: "",
      mode: "",
      activeEnv: "",
      availableEnvs: [],
      counts: {
        suites: 0,
        tests: 0,
        initFiles: 0,
        modules: 0,
        schemas: 0,
        environments: 0
      },
      reports: {
        hasSummary: false,
        status: "unknown",
        passed: 0,
        failed: 0,
        total: 0,
        durationMs: 0,
        hasAllureDir: false,
        failedTests: []
      },
      runner: {
        suiteOptions: [],
        testOptions: [],
        tagOptions: []
      },
      tree: {
        suiteNodes: []
      }
    };
  }

  const suiteAssets = countSuiteAssets(root.suitesDir);
  const summaryPath = path.join(root.speqRoot, "reports", "results", "summary.json");
  const summary = readSummary(summaryPath);
  const allureDir = path.join(root.speqRoot, "reports", "allure");
  const runner = collectRunnerOptions(root);

  return {
    hasRoot: true,
    workspaceName: root.workspaceFolder.name,
    rootPath: root.speqRoot,
    mode: root.mode,
    activeEnv: "",
    availableEnvs: [],
    counts: {
      suites: suiteAssets.suites,
      tests: suiteAssets.tests,
      initFiles: suiteAssets.initFiles,
      modules: countFiles(root.modulesDir, (name) => name.endsWith(".yaml") || name.endsWith(".yml")),
      schemas: countFiles(root.schemasDir, (name) => name.endsWith(".json") || name.endsWith(".yaml") || name.endsWith(".yml")),
      environments: countFiles(root.environmentsDir, (name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    },
    reports: {
      hasSummary: Boolean(summary),
      status: summary?.status ?? "unknown",
      passed: summary?.totals?.passed ?? 0,
      failed: summary?.totals?.failed ?? 0,
      total: summary?.totals?.total ?? 0,
      durationMs: summary?.durationMs ?? 0,
      hasAllureDir: fs.existsSync(allureDir),
      failedTests: buildFailedTests(summary, root)
    },
    runner,
    tree: {
      suiteNodes: buildSuiteTree(root)
    }
  };
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 16; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

export class StudioHomeViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly resolveRoot: () => SpeqRootInfo | undefined,
    private readonly resolveActiveEnv: (root: SpeqRootInfo) => string | undefined,
    private readonly listEnvs: (root: SpeqRootInfo) => string[]
  ) {}

  refresh(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.postMessage({ type: "studio-home:update", state: this.buildStateWithEnv(this.resolveRoot()) });
  }

  private buildStateWithEnv(root: SpeqRootInfo | undefined): StudioHomeState {
    const state = buildState(root);
    if (!root) {
      return state;
    }
    const availableEnvs = this.listEnvs(root);
    const activeEnv = this.resolveActiveEnv(root) ?? availableEnvs[0] ?? "";
    if (activeEnv && !availableEnvs.includes(activeEnv)) {
      availableEnvs.unshift(activeEnv);
    }
    return {
      ...state,
      activeEnv,
      availableEnvs
    };
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const scriptUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webviews", "studioHome.js")
    );
    const nonce = createNonce();
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist", "webviews")]
    };
    const state = this.buildStateWithEnv(this.resolveRoot());
    webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webviewView.webview.cspSource} https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SPEQ Studio Home</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">window.__SPEQ_STUDIO_HOME__ = ${JSON.stringify(state)};</script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (!message?.type || typeof message.type !== "string") {
        return;
      }
      switch (message.type) {
        case "studio-home:validate":
          await vscode.commands.executeCommand("speq.validateWorkspace");
          break;
        case "studio-home:run-suite":
          await vscode.commands.executeCommand("speq.runSuite");
          break;
        case "studio-home:run-test":
          await vscode.commands.executeCommand("speq.runTest");
          break;
        case "studio-home:open-summary":
          await vscode.commands.executeCommand("speq.openSummaryReport");
          break;
        case "studio-home:open-allure":
          await vscode.commands.executeCommand("speq.openAllureDirectory");
          break;
        case "studio-home:serve-allure":
          await vscode.commands.executeCommand("speq.allureServe");
          break;
        case "studio-home:open-flow":
          if (typeof message.fullPath === "string") {
            await vscode.commands.executeCommand("speq.openTestFlowAtPath", { fullPath: message.fullPath });
          } else {
            await vscode.commands.executeCommand("speq.openTestFlowAtPath");
          }
          break;
        case "studio-home:open-file":
          if (typeof message.fullPath === "string") {
            await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(message.fullPath));
          }
          break;
        case "studio-home:select-root":
          await vscode.commands.executeCommand("speq.selectRoot");
          break;
        case "studio-home:select-env":
          if (typeof message.envName === "string") {
            await vscode.commands.executeCommand("speq.selectActiveEnv", message.envName);
          }
          break;
        case "studio-home:refresh":
          await vscode.commands.executeCommand("speq.refreshStudioHome");
          break;
        case "studio-home:run-custom":
          webviewView.webview.postMessage({ type: "studio-home:run-started" });
          try {
            const runResult = await vscode.commands.executeCommand<RunExecutionResult>("speq.runFromStudioHome", message.payload ?? {});
            webviewView.webview.postMessage({
              type: "studio-home:run-finished",
              result: runResult ?? null
            });
          } catch (error) {
            const details = error instanceof Error ? error.message : String(error);
            webviewView.webview.postMessage({
              type: "studio-home:run-finished",
              result: {
                command: "",
                exitCode: 1,
                stdout: "",
                stderr: details,
                durationMs: 0
              }
            });
          }
          break;
        default:
          break;
      }
    });
  }
}
