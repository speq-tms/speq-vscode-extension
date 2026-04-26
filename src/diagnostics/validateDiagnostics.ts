import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { runSpeq } from "../cli";
import { SpeqRootInfo, ValidateIssue, ValidateJsonPayload } from "../types";

const FILE_PATH_PATTERN = / in (.+?\.(?:ya?ml))(?:$|:| step\[| assert\[| imports\[| suite\.imports\[)/;
const LINE_PATTERN = /line (\d+)/;
const LINE_COLUMN_PATTERN = /line (\d+) column (\d+)/;
const STEP_INDEX_PATTERN = /step\[(\d+)\]/;
const ASSERT_INDEX_PATTERN = /assert\[(\d+)\]/;
const IMPORT_INDEX_PATTERN = /imports\[(\d+)\]\.module/;
const SUITE_IMPORT_INDEX_PATTERN = /suite\.imports\[(\d+)\]\.module/;

interface DiagnosticPosition {
  line: number;
  column: number;
}

function createDiagnostic(message: string, position?: DiagnosticPosition): vscode.Diagnostic {
  const line = Math.max(0, position?.line ?? 0);
  const column = Math.max(0, position?.column ?? 0);
  const range = new vscode.Range(line, column, line, column + 1);
  return new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
}

function resolveUriForError(errorMessage: string, root: SpeqRootInfo): vscode.Uri {
  const filePathMatch = errorMessage.match(FILE_PATH_PATTERN);
  if (!filePathMatch || !filePathMatch[1]) {
    return vscode.Uri.file(root.manifestPath);
  }

  const filePath = filePathMatch[1];
  if (path.isAbsolute(filePath)) {
    return vscode.Uri.file(filePath);
  }

  return vscode.Uri.file(path.resolve(root.speqRoot, filePath));
}

function resolveUriForIssue(issue: ValidateIssue, root: SpeqRootInfo): vscode.Uri {
  if (!issue.file || !issue.file.trim()) {
    return vscode.Uri.file(root.manifestPath);
  }

  const filePath = issue.file.trim();
  if (path.isAbsolute(filePath)) {
    return vscode.Uri.file(filePath);
  }

  return vscode.Uri.file(path.resolve(root.speqRoot, filePath));
}

function parseValidatePayload(rawText: string): ValidateJsonPayload | undefined {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as ValidateJsonPayload;
  } catch {
    return undefined;
  }
}

function safeReadLines(filePath: string, cache: Map<string, string[]>): string[] {
  const cached = cache.get(filePath);
  if (cached) {
    return cached;
  }

  try {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    cache.set(filePath, lines);
    return lines;
  } catch {
    return [];
  }
}

function findNthLine(lines: string[], index: number, predicate: (line: string, lineIndex: number) => boolean): number | undefined {
  if (index < 0) {
    return undefined;
  }

  let current = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (!predicate(lines[i], i)) {
      continue;
    }
    if (current === index) {
      return i;
    }
    current += 1;
  }

  return undefined;
}

function findTopLevelImportLine(lines: string[], index: number): number | undefined {
  let inImports = false;
  let importsIndent = -1;
  const importLines: number[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();

    if (!inImports && /^imports:\s*$/.test(trimmed)) {
      inImports = true;
      importsIndent = indent;
      continue;
    }

    if (!inImports) {
      continue;
    }

    if (trimmed.length > 0 && indent <= importsIndent && !/^-\s*module\s*:/.test(trimmed)) {
      break;
    }

    if (/^-\s*module\s*:/.test(trimmed)) {
      importLines.push(i);
    }
  }

  return importLines[index];
}

function findSuiteImportLine(lines: string[], index: number): number | undefined {
  let inSuite = false;
  let suiteIndent = -1;
  let inImports = false;
  let importsIndent = -1;
  const importLines: number[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();

    if (!inSuite && /^suite:\s*$/.test(trimmed)) {
      inSuite = true;
      suiteIndent = indent;
      continue;
    }

    if (!inSuite) {
      continue;
    }

    if (trimmed.length > 0 && indent <= suiteIndent) {
      break;
    }

    if (!inImports && /^imports:\s*$/.test(trimmed)) {
      inImports = true;
      importsIndent = indent;
      continue;
    }

    if (!inImports) {
      continue;
    }

    if (trimmed.length > 0 && indent <= importsIndent && !/^-+\s*module\s*:/.test(trimmed)) {
      inImports = false;
      continue;
    }

    if (/^-\s*module\s*:/.test(trimmed)) {
      importLines.push(i);
    }
  }

  return importLines[index];
}

function inferLegacyPosition(message: string, filePath: string, linesCache: Map<string, string[]>): DiagnosticPosition | undefined {
  const lineColumnMatch = message.match(LINE_COLUMN_PATTERN);
  if (lineColumnMatch) {
    return {
      line: Math.max(0, Number(lineColumnMatch[1]) - 1),
      column: Math.max(0, Number(lineColumnMatch[2]) - 1)
    };
  }

  const lineMatch = message.match(LINE_PATTERN);
  if (lineMatch) {
    return {
      line: Math.max(0, Number(lineMatch[1]) - 1),
      column: 0
    };
  }

  const lines = safeReadLines(filePath, linesCache);
  if (lines.length === 0) {
    return undefined;
  }

  const stepMatch = message.match(STEP_INDEX_PATTERN);
  if (stepMatch) {
    const line = findNthLine(lines, Number(stepMatch[1]), (candidate) => /^\s*-\s*type\s*:/.test(candidate));
    if (typeof line === "number") {
      return { line, column: 0 };
    }
  }

  const assertMatch = message.match(ASSERT_INDEX_PATTERN);
  if (assertMatch) {
    const line = findNthLine(lines, Number(assertMatch[1]), (candidate, idx) => {
      if (!/^\s*-\s*type\s*:/.test(candidate)) {
        return false;
      }

      for (let lookback = idx - 1; lookback >= Math.max(0, idx - 6); lookback -= 1) {
        const prior = lines[lookback].trim();
        if (!prior) {
          continue;
        }
        return prior.startsWith("assert:");
      }
      return false;
    });

    if (typeof line === "number") {
      return { line, column: 0 };
    }
  }

  const suiteImportMatch = message.match(SUITE_IMPORT_INDEX_PATTERN);
  if (suiteImportMatch) {
    const line = findSuiteImportLine(lines, Number(suiteImportMatch[1]));
    if (typeof line === "number") {
      return { line, column: 0 };
    }
  }

  const importMatch = message.match(IMPORT_INDEX_PATTERN);
  if (importMatch) {
    const line = findTopLevelImportLine(lines, Number(importMatch[1]));
    if (typeof line === "number") {
      return { line, column: 0 };
    }
  }

  return undefined;
}

function setDiagnosticsByUri(entries: Array<{ uri: vscode.Uri; diagnostic: vscode.Diagnostic }>, collection: vscode.DiagnosticCollection): void {
  const byUri = new Map<string, vscode.Diagnostic[]>();
  for (const item of entries) {
    const key = item.uri.toString();
    const existing = byUri.get(key) ?? [];
    existing.push(item.diagnostic);
    byUri.set(key, existing);
  }

  for (const [key, diagnostics] of byUri.entries()) {
    collection.set(vscode.Uri.parse(key), diagnostics);
  }
}

export async function refreshValidateDiagnostics(
  root: SpeqRootInfo,
  collection: vscode.DiagnosticCollection,
  output: vscode.OutputChannel
): Promise<void> {
  const result = await runSpeq(["validate", "--speq-root", root.speqRoot, "--format", "json"], root.workspaceFolder.uri.fsPath);
  output.appendLine(`$ ${result.command}`);
  const payload = parseValidatePayload(result.stdout) ?? parseValidatePayload(result.stderr);

  collection.clear();

  if (!payload) {
    output.appendLine("speq validate did not return JSON payload. stderr:");
    output.appendLine(result.stderr || "(empty)");
    if (result.exitCode !== 0) {
      vscode.window.showErrorMessage("speq validate failed: see 'speq' output channel.");
    }
    return;
  }

  const issues = payload.issues ?? [];
  if (issues.length > 0) {
    const entries = issues.map((issue) => {
      const uri = resolveUriForIssue(issue, root);
      const line = issue.line ? Math.max(0, issue.line - 1) : 0;
      const column = issue.column ? Math.max(0, issue.column - 1) : 0;
      const label = issue.code ? `[${issue.code}] ` : "";
      return {
        uri,
        diagnostic: createDiagnostic(`${label}${issue.message}`, { line, column })
      };
    });
    setDiagnosticsByUri(entries, collection);
    vscode.window.showWarningMessage(`speq validate: found ${issues.length} issue(s).`);
    return;
  }

  const errors = payload.errors ?? [];
  if (errors.length === 0) {
    vscode.window.setStatusBarMessage("speq validate: no issues", 3000);
    return;
  }

  const lineCache = new Map<string, string[]>();
  const entries: Array<{ uri: vscode.Uri; diagnostic: vscode.Diagnostic }> = [];
  for (const message of errors) {
    const uri = resolveUriForError(message, root);
    const position = inferLegacyPosition(message, uri.fsPath, lineCache);
    entries.push({ uri, diagnostic: createDiagnostic(message, position) });
  }

  setDiagnosticsByUri(entries, collection);
  vscode.window.showWarningMessage(`speq validate: found ${errors.length} issue(s).`);
}
