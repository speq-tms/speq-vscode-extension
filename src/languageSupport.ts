import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SpeqRootInfo } from "./types";

const STEP_TYPES = ["api", "use"];
const ASSERT_TYPES = ["status", "json", "contains", "notcontains", "exists", "regex", "schema"];

interface ImportEntry {
  module: string;
  alias: string;
}

interface ModuleActionInfo {
  name: string;
  properties: string[];
}

function isYamlDocument(document: vscode.TextDocument): boolean {
  return document.languageId === "yaml" || document.languageId === "yml";
}

function isInsideSpeqRoot(document: vscode.TextDocument, root: SpeqRootInfo | undefined): boolean {
  if (!root) {
    return false;
  }
  return document.uri.fsPath.startsWith(root.speqRoot);
}

function indentationOf(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function parseImportEntries(text: string): ImportEntry[] {
  const lines = text.split(/\r?\n/);
  const result: ImportEntry[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const moduleMatch = lines[i].match(/^\s*-\s*module:\s*["']?([^"']+)["']?\s*$/);
    if (!moduleMatch?.[1]) {
      continue;
    }

    const moduleName = moduleMatch[1].trim();
    let alias: string | undefined;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j += 1) {
      const candidate = lines[j];
      if (/^\s*-\s*module:/.test(candidate)) {
        break;
      }
      const aliasMatch = candidate.match(/^\s*alias:\s*["']?([^"']+)["']?\s*$/);
      if (aliasMatch?.[1]) {
        alias = aliasMatch[1].trim();
        break;
      }
    }

    if (!alias) {
      const parts = moduleName.split("/");
      const fileName = parts[parts.length - 1] ?? moduleName;
      alias = fileName.replace(/\.(yaml|yml)$/i, "");
    }

    result.push({ module: moduleName, alias });
  }

  return result;
}

function moduleCandidates(modulesDir: string, moduleName: string): string[] {
  const base = path.join(modulesDir, moduleName);
  if (/\.(yaml|yml)$/i.test(moduleName)) {
    return [base];
  }
  return [base, `${base}.yaml`, `${base}.yml`];
}

function loadModuleActions(modulesDir: string, moduleName: string): ModuleActionInfo[] {
  const filePath = moduleCandidates(modulesDir, moduleName).find((candidate) => fs.existsSync(candidate));
  if (!filePath) {
    return [];
  }

  try {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    const actions: ModuleActionInfo[] = [];
    let inActions = false;
    let actionsIndent = -1;
    let currentAction: ModuleActionInfo | undefined;
    let inProperties = false;
    let propertiesIndent = -1;

    for (const line of lines) {
      const trimmed = line.trim();
      const indent = indentationOf(line);

      if (!inActions && /^actions:\s*$/.test(trimmed)) {
        inActions = true;
        actionsIndent = indent;
        continue;
      }

      if (!inActions) {
        continue;
      }

      if (trimmed.length > 0 && indent <= actionsIndent) {
        break;
      }

      const actionMatch = line.match(/^\s{2}([A-Za-z0-9_.-]+):\s*$/);
      if (actionMatch?.[1]) {
        currentAction = { name: actionMatch[1], properties: [] };
        actions.push(currentAction);
        inProperties = false;
        continue;
      }

      if (!currentAction) {
        continue;
      }

      if (/^\s{4}properties:\s*$/.test(line)) {
        inProperties = true;
        propertiesIndent = indent;
        continue;
      }

      if (inProperties && trimmed.length > 0 && indent <= propertiesIndent) {
        inProperties = false;
      }

      if (inProperties) {
        const propertyMatch = line.match(/^\s{6}-\s*([A-Za-z0-9_.-]+)\s*$/);
        if (propertyMatch?.[1]) {
          currentAction.properties.push(propertyMatch[1]);
        }
      }
    }

    return actions;
  } catch {
    return [];
  }
}

function collectImportedActions(document: vscode.TextDocument, root: SpeqRootInfo): Map<string, string[]> {
  const imports = parseImportEntries(document.getText());
  const actionMap = new Map<string, string[]>();

  for (const entry of imports) {
    const moduleActions = loadModuleActions(root.modulesDir, entry.module);
    const qualifiedNames = moduleActions.map((action) => `${entry.alias}.${action.name}`);
    if (qualifiedNames.length > 0) {
      actionMap.set(entry.alias, qualifiedNames);
    }
  }

  return actionMap;
}

function collectActionProperties(document: vscode.TextDocument, root: SpeqRootInfo): Map<string, string[]> {
  const imports = parseImportEntries(document.getText());
  const byAction = new Map<string, string[]>();

  for (const entry of imports) {
    const moduleActions = loadModuleActions(root.modulesDir, entry.module);
    for (const action of moduleActions) {
      byAction.set(`${entry.alias}.${action.name}`, action.properties);
    }
  }

  return byAction;
}

function nearestActionValue(document: vscode.TextDocument, position: vscode.Position): string | undefined {
  for (let line = position.line; line >= Math.max(0, position.line - 20); line -= 1) {
    const text = document.lineAt(line).text;
    const match = text.match(/^\s*action:\s*["']?([^"']+)["']?\s*$/);
    if (match?.[1]) {
      return match[1].trim();
    }
    if (/^\s*-\s*type:\s*/.test(text) && line < position.line) {
      break;
    }
  }
  return undefined;
}

function isAssertTypePosition(document: vscode.TextDocument, position: vscode.Position): boolean {
  for (let line = position.line; line >= Math.max(0, position.line - 12); line -= 1) {
    const text = document.lineAt(line).text.trim();
    if (text.startsWith("assert:")) {
      return true;
    }
    if (text.startsWith("- type:") && line < position.line) {
      break;
    }
  }
  return false;
}

function isPropertiesBlockPosition(document: vscode.TextDocument, position: vscode.Position): boolean {
  const currentIndent = indentationOf(document.lineAt(position.line).text);
  for (let line = position.line; line >= Math.max(0, position.line - 16); line -= 1) {
    const text = document.lineAt(line).text;
    const trimmed = text.trim();
    if (/^properties:\s*$/.test(trimmed) && indentationOf(text) < currentIndent) {
      return true;
    }
    if (/^\s*-\s*type:\s*/.test(text) && line < position.line) {
      break;
    }
  }
  return false;
}

function actionCompletionItems(actions: Map<string, string[]>): vscode.CompletionItem[] {
  const items: vscode.CompletionItem[] = [];
  for (const values of actions.values()) {
    for (const actionName of values) {
      const item = new vscode.CompletionItem(actionName, vscode.CompletionItemKind.Function);
      item.detail = "speq module action";
      items.push(item);
    }
  }
  return items;
}

function valueCompletionItems(values: string[], detail: string): vscode.CompletionItem[] {
  return values.map((value) => {
    const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.Value);
    item.detail = detail;
    return item;
  });
}

function keyCompletionItems(keys: string[]): vscode.CompletionItem[] {
  return keys.map((key) => {
    const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
    item.insertText = `${key}: `;
    item.detail = "action property";
    return item;
  });
}

function hoverForWord(word: string): vscode.Hover | undefined {
  if (word === "schema") {
    return new vscode.Hover("`assert.type: schema` validates response body against JSON Schema via `ref` or `inline`.");
  }
  if (word === "action") {
    return new vscode.Hover("`use.action` references imported module action in `<alias>.<action>` format.");
  }
  if (word === "properties") {
    return new vscode.Hover("`use.properties` passes action parameters used inside `{{templates}}` in module steps.");
  }
  if (word === "init" || word === "suite") {
    return new vscode.Hover("`init.yaml` uses `suite` section for shared variables/imports and hooks (`beforeAll`, `beforeEach`, `afterEach`, `afterAll`).");
  }
  return undefined;
}

export function registerDslLanguageSupport(
  context: vscode.ExtensionContext,
  resolveRoot: () => SpeqRootInfo | undefined
): void {
  const selector: vscode.DocumentSelector = [{ language: "yaml" }, { language: "yml" }];

  const completion = vscode.languages.registerCompletionItemProvider(
    selector,
    {
      provideCompletionItems(document, position) {
        const root = resolveRoot();
        if (!isYamlDocument(document) || !isInsideSpeqRoot(document, root)) {
          return [];
        }

        const linePrefix = document.lineAt(position.line).text.slice(0, position.character);

        if (/\btype:\s*[\w-]*$/.test(linePrefix)) {
          if (isAssertTypePosition(document, position)) {
            return valueCompletionItems(ASSERT_TYPES, "speq assertion type");
          }
          return valueCompletionItems(STEP_TYPES, "speq step type");
        }

        if (/\baction:\s*["']?[\w.-]*$/.test(linePrefix) && root) {
          return actionCompletionItems(collectImportedActions(document, root));
        }

        if (isPropertiesBlockPosition(document, position) && root) {
          const action = nearestActionValue(document, position);
          if (!action) {
            return [];
          }
          const propertiesByAction = collectActionProperties(document, root);
          const keys = propertiesByAction.get(action) ?? [];
          return keyCompletionItems(keys);
        }

        return [];
      }
    },
    ":",
    ".",
    "-"
  );

  const hover = vscode.languages.registerHoverProvider(selector, {
    provideHover(document, position) {
      const root = resolveRoot();
      if (!isYamlDocument(document) || !isInsideSpeqRoot(document, root)) {
        return undefined;
      }
      const range = document.getWordRangeAtPosition(position, /[A-Za-z][A-Za-z.]*/);
      if (!range) {
        return undefined;
      }
      return hoverForWord(document.getText(range));
    }
  });

  context.subscriptions.push(completion, hover);
}
