import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type StudioTab = "home" | "tree" | "runner" | "results";

type SuiteTreeNode = {
  id: string;
  label: string;
  kind: "suite" | "test" | "init";
  relativePath: string;
  fullPath: string;
  children: SuiteTreeNode[];
};

type RunExecutionResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

type FailedTestSummary = {
  id: string;
  message: string;
  durationMs: number;
  relativePath?: string;
  fullPath?: string;
};

type LogLevel = "meta" | "stdout" | "stderr";

type LogLine = {
  id: number;
  level: LogLevel;
  text: string;
};

type TreeStats = {
  suites: number;
  tests: number;
  initFiles: number;
};

type StudioHomeState = {
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
};

declare global {
  interface Window {
    __SPEQ_STUDIO_HOME__: StudioHomeState;
    acquireVsCodeApi: () => { postMessage: (payload: unknown) => void };
  }
}

const vscode = window.acquireVsCodeApi();

function ActionButton(props: { label: string; action: string; disabled?: boolean }) {
  return (
    <button
      className="action-btn"
      disabled={props.disabled}
      onClick={() => vscode.postMessage({ type: props.action })}
      type="button"
    >
      {props.label}
    </button>
  );
}

function IconActionButton(props: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className="action-btn compact"
      disabled={props.disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onClick();
      }}
      type="button"
    >
      {props.label}
    </button>
  );
}

function TabButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`tab-btn${props.active ? " active" : ""}`} type="button" onClick={props.onClick}>
      {props.label}
    </button>
  );
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function collectSuiteIds(nodes: SuiteTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind !== "suite") {
      continue;
    }
    ids.push(node.id);
    ids.push(...collectSuiteIds(node.children));
  }
  return ids;
}

function countTreeStats(nodes: SuiteTreeNode[]): TreeStats {
  const stats: TreeStats = { suites: 0, tests: 0, initFiles: 0 };
  for (const node of nodes) {
    if (node.kind === "suite") {
      stats.suites += 1;
      const nested = countTreeStats(node.children);
      stats.suites += nested.suites;
      stats.tests += nested.tests;
      stats.initFiles += nested.initFiles;
    } else if (node.kind === "test") {
      stats.tests += 1;
    } else if (node.kind === "init") {
      stats.initFiles += 1;
    }
  }
  return stats;
}

function filterSuiteNodes(nodes: SuiteTreeNode[], rawQuery: string): SuiteTreeNode[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return nodes;
  }
  const next: SuiteTreeNode[] = [];
  for (const node of nodes) {
    const selfMatch = node.relativePath.toLowerCase().includes(query) || node.label.toLowerCase().includes(query);
    if (node.kind !== "suite") {
      if (selfMatch) {
        next.push(node);
      }
      continue;
    }
    if (selfMatch) {
      next.push(node);
      continue;
    }
    const children = filterSuiteNodes(node.children, query);
    if (children.length > 0) {
      next.push({ ...node, children });
    }
  }
  return next;
}

function HomeApp() {
  const [state, setState] = useState<StudioHomeState>(window.__SPEQ_STUDIO_HOME__);
  const [activeTab, setActiveTab] = useState<StudioTab>("home");
  const [targetType, setTargetType] = useState<"all" | "suite" | "test">("all");
  const [suitePath, setSuitePath] = useState("");
  const [testPath, setTestPath] = useState("");
  const [reportMode, setReportMode] = useState<"all" | "summary" | "allure">("all");
  const [tagsInput, setTagsInput] = useState("");
  const [expandedSuiteIds, setExpandedSuiteIds] = useState<Set<string>>(new Set());
  const [treeFilter, setTreeFilter] = useState("");
  const [failedFilter, setFailedFilter] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [runLog, setRunLog] = useState<LogLine[]>([]);
  const logCounterRef = useRef(1);

  const appendLogLine = (level: LogLevel, text: string) => {
    setRunLog((prev) => [...prev, { id: logCounterRef.current++, level, text }]);
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "studio-home:update" && event.data.state) {
        setState(event.data.state as StudioHomeState);
        return;
      }
      if (event.data?.type === "studio-home:run-started") {
        setIsRunning(true);
        appendLogLine("meta", "Starting run...");
        return;
      }
      if (event.data?.type === "studio-home:run-finished") {
        setIsRunning(false);
        const result = event.data.result as RunExecutionResult | null;
        if (!result) {
          appendLogLine("stderr", "Run did not return a result.");
          return;
        }
        appendLogLine("meta", `Command: ${result.command || "<unknown>"}`);
        appendLogLine("meta", `Exit code: ${result.exitCode} | Duration: ${result.durationMs} ms`);
        for (const line of splitLines(result.stdout)) {
          appendLogLine("stdout", line);
        }
        for (const line of splitLines(result.stderr)) {
          appendLogLine("stderr", line);
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    // Keep Tree View predictable when root changes: start with all folders collapsed.
    setExpandedSuiteIds(new Set());
    setTreeFilter("");
  }, [state.rootPath]);

  if (!state.hasRoot) {
    return (
      <main className="page">
        <div className="header-row">
          <h2>SPEQ Studio Home</h2>
          <button className="icon-btn" type="button" onClick={() => vscode.postMessage({ type: "studio-home:refresh" })} title="Refresh">
            ↻
          </button>
        </div>
        <p className="muted">No SPEQ root detected in the current workspace.</p>
        <ActionButton label="Select Root" action="studio-home:select-root" />
      </main>
    );
  }

  const statusClass = state.reports.status.toLowerCase() === "passed" ? "ok" : state.reports.status.toLowerCase() === "failed" ? "bad" : "muted";
  const parsedTags = tagsInput
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const filteredTreeNodes = filterSuiteNodes(state.tree.suiteNodes, treeFilter);
  const totalTreeStats = countTreeStats(state.tree.suiteNodes);
  const filteredTreeStats = countTreeStats(filteredTreeNodes);
  const failedTests = state.reports.failedTests;
  const normalizedFailedFilter = failedFilter.trim().toLowerCase();
  const filteredFailedTests = normalizedFailedFilter
    ? failedTests.filter(
        (test) =>
          test.id.toLowerCase().includes(normalizedFailedFilter) ||
          test.message.toLowerCase().includes(normalizedFailedFilter) ||
          (test.relativePath ?? "").toLowerCase().includes(normalizedFailedFilter)
      )
    : failedTests;

  const runCustom = () => {
    setActiveTab("runner");
    vscode.postMessage({
      type: "studio-home:run-custom",
      payload: {
        targetType,
        suitePath: targetType === "suite" ? suitePath : undefined,
        testPath: targetType === "test" ? testPath : undefined,
        report: reportMode,
        tags: parsedTags
      }
    });
  };

  const clearRunLog = () => {
    setRunLog([]);
  };

  const prefillSuiteRun = (suiteRelPath: string) => {
    setTargetType("suite");
    setSuitePath(suiteRelPath);
    setActiveTab("runner");
    appendLogLine("meta", `Runner prefilled with suite: ${suiteRelPath}`);
  };

  const prefillTestRun = (testRelPath: string) => {
    setTargetType("test");
    setTestPath(testRelPath);
    setActiveTab("runner");
    appendLogLine("meta", `Runner prefilled with test: ${testRelPath}`);
  };

  const setSuiteExpanded = (suiteId: string, expanded: boolean) => {
    setExpandedSuiteIds((prev) => {
      const next = new Set(prev);
      if (expanded) {
        next.add(suiteId);
      } else {
        next.delete(suiteId);
      }
      return next;
    });
  };

  const expandAllSuites = () => {
    setExpandedSuiteIds(new Set(collectSuiteIds(state.tree.suiteNodes)));
  };

  const collapseAllSuites = () => {
    setExpandedSuiteIds(new Set());
  };

  const renderTreeNode = (node: SuiteTreeNode): React.JSX.Element => {
    if (node.kind === "suite") {
      const isExpanded = expandedSuiteIds.has(node.id);
      const nestedStats = countTreeStats(node.children);
      return (
        <details
          key={node.id}
          className="tree-node"
          open={isExpanded}
          onToggle={(event) => setSuiteExpanded(node.id, (event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>
            <span className="tree-label">📁 {node.relativePath}</span>
            <span className="tree-meta">
              {nestedStats.suites} folders · {nestedStats.tests} tests
            </span>
            <IconActionButton label="Run suite" onClick={() => prefillSuiteRun(node.relativePath)} />
          </summary>
          <div className="tree-children">{node.children.map((child) => renderTreeNode(child))}</div>
        </details>
      );
    }

    const isTest = node.kind === "test";
    return (
      <div key={node.id} className="tree-leaf">
        <span className="tree-label">
          {isTest ? "🧪" : "⚙"} {node.relativePath}
        </span>
        <div className="leaf-actions">
          {isTest && <IconActionButton label="Run test" onClick={() => prefillTestRun(node.relativePath)} />}
          {isTest && (
            <IconActionButton
              label="Open flow"
              onClick={() => vscode.postMessage({ type: "studio-home:open-flow", fullPath: node.fullPath })}
            />
          )}
          <IconActionButton label="Open file" onClick={() => vscode.postMessage({ type: "studio-home:open-file", fullPath: node.fullPath })} />
        </div>
      </div>
    );
  };

  return (
    <main className="page">
      <header>
        <div className="header-row">
          <h2>SPEQ Studio</h2>
          <button className="icon-btn" type="button" onClick={() => vscode.postMessage({ type: "studio-home:refresh" })} title="Refresh">
            ↻
          </button>
        </div>
        <p className="muted">
          {state.workspaceName} · {state.mode}
        </p>
        <p className="path">{state.rootPath}</p>
      </header>

      <section className="tabs">
        <TabButton label="Home" active={activeTab === "home"} onClick={() => setActiveTab("home")} />
        <TabButton label="Tree View" active={activeTab === "tree"} onClick={() => setActiveTab("tree")} />
        <TabButton label="Runner" active={activeTab === "runner"} onClick={() => setActiveTab("runner")} />
        <TabButton label="Results" active={activeTab === "results"} onClick={() => setActiveTab("results")} />
      </section>

      {activeTab === "home" && (
        <>
          <section className="card">
            <h3>Active Environment</h3>
            {state.availableEnvs.length > 0 ? (
              <div className="env-row">
                <select
                  className="env-select"
                  value={state.activeEnv}
                  onChange={(event) => vscode.postMessage({ type: "studio-home:select-env", envName: event.target.value })}
                >
                  {state.availableEnvs.map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
                <span className="muted">Used by runner and context actions.</span>
              </div>
            ) : (
              <p className="muted">No environments found under environments directory.</p>
            )}
          </section>
          <section className="card">
            <h3>Studio Controls</h3>
            <div className="quick-actions">
              <ActionButton label="Validate Workspace" action="studio-home:validate" />
              <ActionButton label="Select Root" action="studio-home:select-root" />
            </div>
          </section>
          <section className="grid">
            <div className="card">
              <h3>Workspace Topology</h3>
              <ul>
                <li>Suites: {state.counts.suites}</li>
                <li>Tests: {state.counts.tests}</li>
                <li>Init files: {state.counts.initFiles}</li>
                <li>Modules: {state.counts.modules}</li>
                <li>Schemas: {state.counts.schemas}</li>
                <li>Environments: {state.counts.environments}</li>
              </ul>
            </div>
            <div className="card">
              <h3>Latest Run Summary</h3>
              {state.reports.hasSummary ? (
                <>
                  <p>
                    Status: <span className={statusClass}>{state.reports.status}</span>
                  </p>
                  <p>
                    Passed: {state.reports.passed}/{state.reports.total}
                  </p>
                  <p>Failed: {state.reports.failed}</p>
                  <p>Duration: {state.reports.durationMs} ms</p>
                </>
              ) : (
                <p className="muted">No summary found yet. Run a suite or test first.</p>
              )}
            </div>
          </section>
        </>
      )}

      {activeTab === "tree" && (
        <section className="card">
          <div className="header-row">
            <h3>Suites & Tests</h3>
            <div className="leaf-actions">
              <IconActionButton label="Expand all" onClick={expandAllSuites} disabled={state.tree.suiteNodes.length === 0} />
              <IconActionButton label="Collapse all" onClick={collapseAllSuites} disabled={expandedSuiteIds.size === 0} />
            </div>
          </div>
          <label className="field">
            <span>Search by suite/test path</span>
            <input
              className="env-select"
              value={treeFilter}
              onChange={(event) => setTreeFilter(event.target.value)}
              placeholder="posts or smoke_get_post_by_id.yaml"
            />
          </label>
          <div className="tree-strip">
            <span>
              Total: {totalTreeStats.suites} folders · {totalTreeStats.tests} tests · {totalTreeStats.initFiles} init
            </span>
            <span>
              Visible: {filteredTreeStats.suites} folders · {filteredTreeStats.tests} tests · {filteredTreeStats.initFiles} init
            </span>
          </div>
          {state.tree.suiteNodes.length > 0 && filteredTreeNodes.length > 0 ? (
            <div className="tree-root">{filteredTreeNodes.map((node) => renderTreeNode(node))}</div>
          ) : state.tree.suiteNodes.length > 0 ? (
            <p className="muted">No Tree View matches for current query.</p>
          ) : (
            <p className="muted">No suites found under suites directory.</p>
          )}
        </section>
      )}

      {activeTab === "runner" && (
        <>
          <section className="card">
            <h3>Runner</h3>
            <div className="runner-grid">
              <label className="field">
                <span>Target</span>
                <select className="env-select" value={targetType} onChange={(event) => setTargetType(event.target.value as "all" | "suite" | "test")}>
                  <option value="all">All tests</option>
                  <option value="suite">Specific suite</option>
                  <option value="test">Specific test</option>
                </select>
              </label>

              {targetType === "suite" && (
                <label className="field">
                  <span>Suite path</span>
                  <select className="env-select" value={suitePath} onChange={(event) => setSuitePath(event.target.value)}>
                    <option value="">Select suite</option>
                    {state.runner.suiteOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {targetType === "test" && (
                <label className="field">
                  <span>Test path</span>
                  <select className="env-select" value={testPath} onChange={(event) => setTestPath(event.target.value)}>
                    <option value="">Select test</option>
                    {state.runner.testOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="field">
                <span>Report mode</span>
                <select className="env-select" value={reportMode} onChange={(event) => setReportMode(event.target.value as "all" | "summary" | "allure")}>
                  <option value="all">all</option>
                  <option value="summary">summary</option>
                  <option value="allure">allure</option>
                </select>
              </label>

              <label className="field full">
                <span>Tags (comma separated)</span>
                <input
                  className="env-select"
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  list="speq-tags"
                  placeholder="smoke,api"
                />
                <datalist id="speq-tags">
                  {state.runner.tagOptions.map((tag) => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="runner-actions">
              <button
                className="action-btn primary"
                type="button"
                onClick={runCustom}
                disabled={isRunning || (targetType === "suite" && !suitePath) || (targetType === "test" && !testPath)}
              >
                {isRunning ? "Running..." : "Run (build CLI)"}
              </button>
              <code className="muted">
                speq run --speq-root ... {targetType === "suite" ? "--suite <path>" : targetType === "test" ? "--test <path>" : ""}
                {" "}--env {state.activeEnv || "<env>"} --report {reportMode}
                {parsedTags.length ? ` --tags ${parsedTags.join(",")}` : ""}
              </code>
            </div>
          </section>
          <section className="card">
            <div className="header-row">
              <h3>Runner Debug Log</h3>
              <IconActionButton label="Clear log" onClick={clearRunLog} disabled={runLog.length === 0} />
            </div>
            <div className="terminal-log">
              {runLog.length === 0 ? (
                <p className="muted">No run output yet. Execute a command from this tab.</p>
              ) : (
                runLog.map((line) => (
                  <div key={line.id} className={`log-line ${line.level}`}>
                    {line.text}
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}

      {activeTab === "results" && (
        <section className="card">
          <h3>Latest Run Summary</h3>
          {state.reports.hasSummary ? (
            <>
              <p>
                Status: <span className={statusClass}>{state.reports.status}</span>
              </p>
              <p>
                Passed: {state.reports.passed}/{state.reports.total}
              </p>
              <p>Failed: {state.reports.failed}</p>
              <p>Duration: {state.reports.durationMs} ms</p>
            </>
          ) : (
            <p className="muted">No summary found yet. Run a suite or test first.</p>
          )}
          <div className="quick-actions">
            <ActionButton label="Open Summary JSON" action="studio-home:open-summary" disabled={!state.reports.hasSummary} />
            <ActionButton label="Open Allure Directory" action="studio-home:open-allure" disabled={!state.reports.hasAllureDir} />
            <ActionButton label="Allure Serve" action="studio-home:serve-allure" disabled={!state.reports.hasAllureDir} />
          </div>
          <div className="failed-tests">
            <div className="header-row">
              <h3>Failed Tests</h3>
              <span className="muted">
                {filteredFailedTests.length}/{failedTests.length}
              </span>
            </div>
            <label className="field">
              <span>Filter failed tests</span>
              <input
                className="env-select"
                value={failedFilter}
                onChange={(event) => setFailedFilter(event.target.value)}
                placeholder="test id, message, or file path"
              />
            </label>
            {failedTests.length === 0 ? (
              <p className="muted">No failed tests in latest summary.</p>
            ) : filteredFailedTests.length === 0 ? (
              <p className="muted">No failed tests match current filter.</p>
            ) : (
              <div className="failed-list">
                {filteredFailedTests.map((test) => (
                  <div key={test.id} className="failed-item">
                    <div className="failed-meta">
                      <strong>{test.id}</strong>
                      <span className="muted">{test.durationMs} ms</span>
                    </div>
                    <p className="failed-message">{test.message}</p>
                    <p className="path">{test.relativePath ?? "Source file not resolved."}</p>
                    <div className="leaf-actions">
                      <IconActionButton
                        label="Open file"
                        onClick={() => test.fullPath && vscode.postMessage({ type: "studio-home:open-file", fullPath: test.fullPath })}
                        disabled={!test.fullPath}
                      />
                      <IconActionButton
                        label="Open flow"
                        onClick={() => test.fullPath && vscode.postMessage({ type: "studio-home:open-flow", fullPath: test.fullPath })}
                        disabled={!test.fullPath}
                      />
                      <IconActionButton
                        label="Prefill runner"
                        onClick={() => test.relativePath && prefillTestRun(test.relativePath)}
                        disabled={!test.relativePath}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

const style = document.createElement("style");
style.textContent = `
  body { margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); }
  .page { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
  .header-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .icon-btn { border: 1px solid var(--vscode-panel-border); background: var(--vscode-editorWidget-background); color: var(--vscode-editor-foreground); border-radius: 6px; width: 30px; height: 30px; cursor: pointer; }
  .icon-btn:hover { background: var(--vscode-list-hoverBackground); }
  .muted { color: var(--vscode-descriptionForeground); margin: 4px 0; }
  .path { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 0; word-break: break-all; }
  .card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; background: var(--vscode-editorWidget-background); }
  .action-btn { border: 1px solid var(--vscode-button-border); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-radius: 6px; padding: 8px; cursor: pointer; text-align: left; }
  .action-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .action-btn.compact { padding: 2px 7px; font-size: 11px; line-height: 1.25; }
  .tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .tab-btn { border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editorWidget-background); color: var(--vscode-editor-foreground); padding: 8px; cursor: pointer; }
  .tab-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .runner-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field > span { font-size: 12px; color: var(--vscode-descriptionForeground); }
  .field.full { grid-column: 1 / -1; }
  .runner-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .env-row { display: flex; flex-direction: column; gap: 8px; }
  .env-select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 6px; padding: 8px; }
  .primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .primary:hover { background: var(--vscode-button-hoverBackground); }
  .quick-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tree-strip { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 6px 8px; background: var(--vscode-sideBar-background); font-size: 12px; color: var(--vscode-descriptionForeground); }
  .tree-root { border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editor-background); display: flex; flex-direction: column; }
  .tree-node > summary { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 8px; cursor: pointer; list-style: none; padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  .tree-node > summary::-webkit-details-marker { display: none; }
  .tree-children { margin-left: 14px; display: flex; flex-direction: column; }
  .tree-leaf { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  .tree-node:last-child > summary { border-bottom: none; }
  .tree-label { word-break: break-word; font-size: 12px; }
  .tree-meta { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .leaf-actions { display: flex; align-items: center; gap: 6px; }
  .failed-tests { margin-top: 12px; border-top: 1px solid var(--vscode-panel-border); padding-top: 12px; display: flex; flex-direction: column; gap: 8px; }
  .failed-list { display: flex; flex-direction: column; gap: 8px; }
  .failed-item { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px; background: var(--vscode-editor-background); display: flex; flex-direction: column; gap: 6px; }
  .failed-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .failed-message { margin: 0; color: var(--vscode-editor-foreground); }
  .terminal-log { border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editor-background); min-height: 120px; max-height: 260px; overflow: auto; padding: 8px; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
  .log-line { white-space: pre-wrap; word-break: break-word; line-height: 1.4; }
  .log-line.meta { color: var(--vscode-descriptionForeground); }
  .log-line.stdout { color: var(--vscode-editor-foreground); }
  .log-line.stderr { color: var(--vscode-testing-iconFailed); }
  h2, h3 { margin: 0 0 8px 0; }
  ul { margin: 0; padding-left: 18px; }
  p { margin: 4px 0; }
  .ok { color: var(--vscode-testing-iconPassed); font-weight: 600; }
  .bad { color: var(--vscode-testing-iconFailed); font-weight: 600; }
  @media (max-width: 900px) { .grid, .runner-grid, .tabs, .quick-actions { grid-template-columns: 1fr; } .tree-leaf { flex-direction: column; align-items: flex-start; } }
`;
document.head.appendChild(style);

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<HomeApp />);
}
