import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { SpeqCodeLensProvider } from "./codelens/speqCodeLensProvider";
import { refreshValidateDiagnostics } from "./diagnostics/validateDiagnostics";
import { openTestFlowWebview } from "./graph/testFlowWebview";
import { StudioHomeViewProvider } from "./home/studioHomeViewProvider";
import { registerDslLanguageSupport } from "./languageSupport";
import { openEnvironmentPreview, openManifestPreview } from "./preview/preview";
import { generateReport, openAllureDirectory, openSummaryReport, promptAndGenerateReport, serveAllureReport } from "./reportActions";
import { runCustom, runSuite, runTest } from "./runActions";
import { ensureYamlSchemaAssociations } from "./schemaAssociation";
import { getActiveSpeqRoot, getPrimarySpeqRoot, getSpeqRoots, setActiveSpeqRoot } from "./speqRoot";
import { SpeqRootInfo } from "./types";

const ACTIVE_ENV_KEY = "speq.activeEnvByRoot";

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
  const readDefaultEnv = (root: SpeqRootInfo): string | undefined => {
    try {
      const content = fs.readFileSync(root.manifestPath, "utf8");
      const match = content.match(/^\s*defaultEnvironment:\s*["']?([^"'\n]+)["']?\s*$/m);
      return match?.[1]?.trim();
    } catch {
      return undefined;
    }
  };
  const listEnvs = (root: SpeqRootInfo): string[] => {
    if (!fs.existsSync(root.environmentsDir)) {
      return [];
    }
    const items = fs
      .readdirSync(root.environmentsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")))
      .map((entry) => entry.name.replace(/\.(yaml|yml)$/i, ""))
      .sort((a, b) => a.localeCompare(b));
    return Array.from(new Set(items));
  };
  const getActiveEnvMap = (): Record<string, string> => context.workspaceState.get<Record<string, string>>(ACTIVE_ENV_KEY, {});
  const setActiveEnv = async (root: SpeqRootInfo, envName: string): Promise<void> => {
    const map = getActiveEnvMap();
    map[root.speqRoot] = envName;
    await context.workspaceState.update(ACTIVE_ENV_KEY, map);
  };
  const getActiveEnv = (root: SpeqRootInfo): string | undefined => {
    const map = getActiveEnvMap();
    const selected = map[root.speqRoot];
    if (selected?.trim()) {
      return selected;
    }
    return readDefaultEnv(root);
  };

  const studioHomeProvider = new StudioHomeViewProvider(context, () => getActiveSpeqRoot(), getActiveEnv, listEnvs);

  let validateTimer: NodeJS.Timeout | undefined;
  let validateInFlight = false;
  let validateQueued = false;

  const runValidation = async (): Promise<void> => {
    const root = getActiveSpeqRoot();
    if (!root) {
      return;
    }
    if (validateInFlight) {
      validateQueued = true;
      return;
    }

    validateInFlight = true;
    try {
      await refreshValidateDiagnostics(root, diagnostics, output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`validate error: ${message}`);
    } finally {
      validateInFlight = false;
      if (validateQueued) {
        validateQueued = false;
        void runValidation();
      }
    }
  };

  const scheduleValidation = (): void => {
    if (validateTimer) {
      clearTimeout(validateTimer);
    }
    validateTimer = setTimeout(() => {
      void runValidation();
    }, 350);
  };

  const refreshHome = (): void => {
    studioHomeProvider.refresh();
  };

  context.subscriptions.push(output, diagnostics);
  context.subscriptions.push({ dispose: () => validateTimer && clearTimeout(validateTimer) });
  registerDslLanguageSupport(context, () => getActiveSpeqRoot());
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider([{ language: "yaml" }, { language: "yml" }], new SpeqCodeLensProvider(() => getActiveSpeqRoot()))
  );
  void ensureYamlSchemaAssociations(context, output);

  const resolveSuitePathFromFile = (filePath: string, rootPath: string): string | undefined => {
    const fileName = path.basename(filePath);
    if (fileName === "init.yaml" || fileName === "init.yml") {
      return path.dirname(filePath);
    }
    const suitesPrefix = `${path.join(rootPath, "suites")}${path.sep}`;
    if (filePath.startsWith(suitesPrefix)) {
      return path.dirname(filePath);
    }
    return undefined;
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("speqStudioHome", studioHomeProvider),
    vscode.commands.registerCommand("speq.refreshStudioHome", () => studioHomeProvider.refresh()),
    vscode.commands.registerCommand("speq.validateWorkspace", async () => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      await runValidation();
    }),
    vscode.commands.registerCommand("speq.runSuite", async () => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      try {
        await runSuite(root, output, undefined, getActiveEnv(root));
        refreshHome();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`run suite error: ${message}`);
        vscode.window.showErrorMessage(`speq run suite failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand("speq.runTest", async () => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      try {
        await runTest(root, output, undefined, getActiveEnv(root));
        refreshHome();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`run test error: ${message}`);
        vscode.window.showErrorMessage(`speq run test failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand(
      "speq.runFromStudioHome",
      async (payload?: { targetType?: "all" | "suite" | "test"; suitePath?: string; testPath?: string; report?: "all" | "summary" | "allure"; tags?: string[] }) => {
        const root = requireRoot();
        if (!root) {
          return;
        }

        const targetType = payload?.targetType ?? "all";
        const suitePath = payload?.suitePath ? path.join(root.speqRoot, payload.suitePath) : undefined;
        const testPath = payload?.testPath ? path.join(root.speqRoot, payload.testPath) : undefined;

        try {
          const runResult = await runCustom(root, output, {
            envName: getActiveEnv(root),
            report: payload?.report ?? "all",
            tags: payload?.tags ?? [],
            suitePath: targetType === "suite" ? suitePath : undefined,
            testPath: targetType === "test" ? testPath : undefined
          });
          refreshHome();
          return runResult;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          output.appendLine(`run custom error: ${message}`);
          vscode.window.showErrorMessage(`speq run failed: ${message}`);
          throw error;
        }
      }
    ),
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
    }),
    vscode.commands.registerCommand("speq.runTestAtPath", async (uri?: vscode.Uri) => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      if (!uri) {
        await runTest(root, output, undefined, getActiveEnv(root));
        return;
      }
      try {
        await runTest(root, output, uri.fsPath, getActiveEnv(root));
        refreshHome();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`run test error: ${message}`);
        vscode.window.showErrorMessage(`speq run test failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand("speq.openTestFlowAtPath", async (target?: { fsPath?: string; fullPath?: string }) => {
      const root = requireRoot();
      if (!root) {
        return;
      }

      let testFile: string | undefined;
      if (target && typeof target.fsPath === "string") {
        testFile = target.fsPath;
      } else if (target && typeof target.fullPath === "string") {
        testFile = target.fullPath;
      }
      if (!testFile) {
        const active = vscode.window.activeTextEditor?.document.uri.fsPath;
        if (active && active.endsWith(".yaml") && active.startsWith(root.suitesDir + path.sep)) {
          testFile = active;
        }
      }

      if (!testFile) {
        vscode.window.showInformationMessage("Open a suite test YAML file to build test flow.");
        return;
      }
      const name = path.basename(testFile);
      if (name === "init.yaml" || name === "init.yml") {
        vscode.window.showInformationMessage("Test flow is available for test files, not for init.yaml.");
        return;
      }

      await openTestFlowWebview(context.extensionUri, root, testFile, output);
    }),
    vscode.commands.registerCommand("speq.runSuiteAtPath", async (uri?: vscode.Uri) => {
      const root = requireRoot();
      if (!root) {
        return;
      }

      const selectedSuitePath = uri ? resolveSuitePathFromFile(uri.fsPath, root.speqRoot) ?? root.suitesDir : undefined;
      try {
        await runSuite(root, output, selectedSuitePath, getActiveEnv(root));
        refreshHome();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`run suite error: ${message}`);
        vscode.window.showErrorMessage(`speq run suite failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand("speq.selectActiveEnv", async (presetEnvName?: string) => {
      const root = requireRoot();
      if (!root) {
        return;
      }

      const envs = listEnvs(root);
      if (envs.length === 0) {
        vscode.window.showWarningMessage("No environments found under environments directory.");
        return;
      }

      const preset = presetEnvName && envs.includes(presetEnvName) ? presetEnvName : undefined;
      let selected = preset;
      if (!selected) {
        selected = await vscode.window.showQuickPick(envs, {
          placeHolder: "Select active environment for run commands",
          canPickMany: false
        });
      }
      if (!selected) {
        return;
      }
      await setActiveEnv(root, selected);
      refreshHome();
    }),
    vscode.commands.registerCommand("speq.allureServe", async () => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      await serveAllureReport(root, output);
    }),
    vscode.commands.registerCommand("speq.generateReport", async () => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      await promptAndGenerateReport(root, output);
      refreshHome();
    }),
    vscode.commands.registerCommand("speq.generateSummaryReport", async () => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      await generateReport(root, output, "summary");
      refreshHome();
    }),
    vscode.commands.registerCommand("speq.reportAll", async () => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      await generateReport(root, output, "all");
      refreshHome();
    }),
    vscode.commands.registerCommand("speq.openSummaryReport", async () => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      await openSummaryReport(root);
    }),
    vscode.commands.registerCommand("speq.openAllureDirectory", async () => {
      const root = requireRoot();
      if (!root) {
        return;
      }
      await openAllureDirectory(root);
    }),
    vscode.commands.registerCommand("speq.selectRoot", async () => {
      const roots = getSpeqRoots();
      if (roots.length === 0) {
        vscode.window.showWarningMessage("No speq root detected in current workspace.");
        return;
      }

      if (roots.length === 1) {
        setActiveSpeqRoot(roots[0].workspaceFolder.uri.toString());
        refreshHome();
        scheduleValidation();
        vscode.window.showInformationMessage(`speq root: ${roots[0].workspaceFolder.name}`);
        return;
      }

      const picked = await vscode.window.showQuickPick(
        roots.map((root) => ({
          label: root.workspaceFolder.name,
          description: root.speqRoot,
          root
        })),
        { placeHolder: "Select active speq root" }
      );
      if (!picked) {
        return;
      }

      setActiveSpeqRoot(picked.root.workspaceFolder.uri.toString());
      refreshHome();
      scheduleValidation();
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      const isYaml = document.fileName.endsWith(".yaml") || document.fileName.endsWith(".yml");
      if (!isYaml) {
        return;
      }

      const roots = getSpeqRoots();
      if (!roots.some((root) => document.uri.fsPath.startsWith(root.speqRoot))) {
        return;
      }

      scheduleValidation();
      refreshHome();
    })
  );
}

export function deactivate(): void {
  // no-op
}
