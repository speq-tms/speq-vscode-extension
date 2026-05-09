import React, { useState } from "react";
import { createRoot } from "react-dom/client";

type StepSourceKind = "test" | "suiteInit" | "moduleAction" | "reusable";

type FlowRefLink = {
  label: string;
  path: string;
  exists: boolean;
};

type FlowStepNode = {
  id: string;
  lane: "setup" | "steps" | "cleanup" | "expanded";
  title: string;
  stepType: string;
  sourcePath: string;
  sourceKind: StepSourceKind;
  assertions: Array<Record<string, unknown>>;
  schemaRefs: FlowRefLink[];
  issues: string[];
  expandedSteps: FlowStepNode[];
};

type FlowIssue = {
  message: string;
  path?: string;
};

type TestFlowGraphModel = {
  testId: string;
  testTitle: string;
  testDescription: string;
  testTags: string[];
  testPath: string;
  rootPath: string;
  imports: Array<{ alias: string; module: string; source: "test" | "suiteInit" }>;
  setupFlow: FlowStepNode[];
  testBodyFlow: FlowStepNode[];
  teardownFlow: FlowStepNode[];
  issues: FlowIssue[];
};

declare global {
  interface Window {
    __SPEQ_TEST_FLOW__: TestFlowGraphModel;
    acquireVsCodeApi: () => { postMessage: (payload: unknown) => void };
  }
}

const vscode = window.acquireVsCodeApi();

function relativePath(filePath: string, model: TestFlowGraphModel): string {
  const rel = filePath.replace(model.rootPath, "").replace(/^[/\\]/, "");
  return rel && !rel.startsWith("..") ? rel : filePath;
}

function openFile(filePath: string): void {
  vscode.postMessage({ type: "openFile", path: filePath });
}

function LinkButton(props: { label: string; path: string; missing?: boolean }): React.JSX.Element {
  return (
    <button className={`link-btn${props.missing ? " missing" : ""}`} type="button" onClick={() => openFile(props.path)}>
      {props.label}
    </button>
  );
}

function formatAssertion(assertion: Record<string, unknown>): string {
  if (typeof assertion.type === "string" && typeof assertion.ref === "string" && assertion.type.trim() === "schema") {
    return `schema -> ${assertion.ref}`;
  }
  return JSON.stringify(assertion);
}

function StepCard(props: { node: FlowStepNode; model: TestFlowGraphModel }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const sourceKindLabel = {
    test: "test",
    suiteInit: "init",
    moduleAction: "module",
    reusable: "reusable"
  }[props.node.sourceKind];

  return (
    <div className="step-card">
      <button className="step-toggle" type="button" onClick={() => setExpanded((prev) => !prev)} aria-expanded={expanded}>
        <div className="step-head">
          <span className="step-type">{props.node.stepType}</span>
          <span className="source-kind">{sourceKindLabel}</span>
          <span className="step-name">{props.node.title}</span>
        </div>
        <span className="step-toggle-icon">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <>
          <div className="meta-row">
            Source:{" "}
            <LinkButton label={relativePath(props.node.sourcePath, props.model)} path={props.node.sourcePath} />
          </div>

          {props.node.schemaRefs.length > 0 && (
            <div className="meta-row">
              Schemas:{" "}
              {props.node.schemaRefs.map((schema, index) => (
                <React.Fragment key={`${schema.path}-${schema.label}`}>
                  <LinkButton
                    label={`${schema.label} (${relativePath(schema.path, props.model)})${schema.exists ? "" : " [missing]"}`}
                    path={schema.path}
                    missing={!schema.exists}
                  />
                  {index < props.node.schemaRefs.length - 1 ? ", " : null}
                </React.Fragment>
              ))}
            </div>
          )}

          {props.node.assertions.length > 0 && (
            <div className="assertions-block">
              <div className="assertions-title">Asserts</div>
              <div className="assertions-list">
                {props.node.assertions.map((assertion, index) => (
                  <code key={`${props.node.id}:assert:${index}`}>{formatAssertion(assertion)}</code>
                ))}
              </div>
            </div>
          )}

          {props.node.issues.length > 0 && (
            <div className="step-issues">
              {props.node.issues.map((issue) => (
                <div key={issue}>WARNING: {issue}</div>
              ))}
            </div>
          )}

          {props.node.expandedSteps.length > 0 && (
            <div className="expanded">
              <div className="expanded-title">Expanded flow</div>
              {props.node.expandedSteps.map((item) => (
                <StepCard key={item.id} node={item} model={props.model} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Lane(props: {
  title: string;
  nodes: FlowStepNode[];
  model: TestFlowGraphModel;
  expanded: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <section className="lane">
      <button className="lane-toggle" type="button" onClick={props.onToggle} aria-expanded={props.expanded}>
        <h2>{props.title}</h2>
        <span className="lane-toggle-icon">{props.expanded ? "▾" : "▸"}</span>
      </button>
      {props.expanded ? (
        props.nodes.length > 0 ? (
          props.nodes.map((node, index) => (
            <React.Fragment key={node.id}>
              <StepCard node={node} model={props.model} />
              {index < props.nodes.length - 1 && <div className="arrow">↓</div>}
            </React.Fragment>
          ))
        ) : (
          <div className="empty-lane">No steps</div>
        )
      ) : (
        <div className="empty-lane">Collapsed</div>
      )}
    </section>
  );
}

function Issues(props: { model: TestFlowGraphModel }): React.JSX.Element {
  if (props.model.issues.length === 0) {
    return <div className="ok-banner">No unresolved references were detected.</div>;
  }

  return (
    <section className="issues">
      <h2>Resolution Warnings</h2>
      <ul>
        {props.model.issues.map((issue, index) => (
          <li key={`${issue.message}-${index}`}>
            {issue.message} (
            {issue.path ? <LinkButton label={relativePath(issue.path, props.model)} path={issue.path} /> : "unknown location"})
          </li>
        ))}
      </ul>
    </section>
  );
}

function App(): React.JSX.Element {
  const model = window.__SPEQ_TEST_FLOW__;
  const [expandedLanes, setExpandedLanes] = useState({
    setup: false,
    testBody: true,
    teardown: false
  });

  const toggleLane = (lane: "setup" | "testBody" | "teardown") => {
    setExpandedLanes((prev) => ({
      ...prev,
      [lane]: !prev[lane]
    }));
  };

  return (
    <main className="page">
      <header className="header">
        <h1>{model.testTitle}</h1>
        <p>
          <strong>ID:</strong> {model.testId}
        </p>
        <p>
          <strong>File:</strong> {relativePath(model.testPath, model)}
        </p>
        {model.testDescription ? (
          <p>
            <strong>Description:</strong> {model.testDescription}
          </p>
        ) : null}
        <p>
          <strong>Tags:</strong>{" "}
          {model.testTags.length > 0 ? model.testTags.map((tag) => <code key={tag}>{tag}</code>) : "none"}
        </p>
      </header>

      <section>
        <strong>Imports</strong>
        <ul className="imports">
          {model.imports.length > 0 ? (
            model.imports.map((item) => (
              <li key={`${item.alias}:${item.module}`}>
                <code>{item.alias}</code> -&gt; {item.module} <span className="import-source">({item.source})</span>
              </li>
            ))
          ) : (
            <li>No imports</li>
          )}
        </ul>
      </section>

      <Issues model={model} />
      <Lane title="Setup" nodes={model.setupFlow} model={model} expanded={expandedLanes.setup} onToggle={() => toggleLane("setup")} />
      <Lane
        title="Test Body"
        nodes={model.testBodyFlow}
        model={model}
        expanded={expandedLanes.testBody}
        onToggle={() => toggleLane("testBody")}
      />
      <Lane
        title="Teardown"
        nodes={model.teardownFlow}
        model={model}
        expanded={expandedLanes.teardown}
        onToggle={() => toggleLane("teardown")}
      />
    </main>
  );
}

const style = document.createElement("style");
style.textContent = `
  body { margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
  .page { padding: 16px; }
  .header { margin-bottom: 16px; }
  .header h1 { margin: 0; font-size: 20px; }
  .header p { margin: 4px 0; color: var(--vscode-descriptionForeground); }
  .header code { margin-right: 6px; }
  .imports { margin: 0 0 16px 0; padding-left: 16px; }
  .lane { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 12px; margin-bottom: 16px; background: var(--vscode-editorWidget-background); }
  .lane h2 { margin-top: 0; font-size: 16px; }
  .lane-toggle { width: 100%; border: none; background: transparent; padding: 0; margin: 0 0 8px 0; display: flex; align-items: center; justify-content: space-between; cursor: pointer; color: inherit; text-align: left; }
  .lane-toggle h2 { margin: 0; }
  .lane-toggle-icon { color: var(--vscode-descriptionForeground); font-size: 14px; }
  .step-card { border-left: 4px solid var(--vscode-button-background); padding: 8px 10px; background: var(--vscode-editor-background); border-radius: 4px; }
  .step-head { display: flex; gap: 8px; align-items: baseline; margin-bottom: 6px; flex-wrap: wrap; }
  .step-toggle { width: 100%; border: none; background: transparent; padding: 0; margin: 0; display: flex; align-items: center; justify-content: space-between; color: inherit; cursor: pointer; text-align: left; }
  .step-toggle .step-head { margin-bottom: 0; }
  .step-toggle-icon { color: var(--vscode-descriptionForeground); font-size: 14px; }
  .step-type { font-size: 11px; text-transform: uppercase; color: var(--vscode-symbolIcon-classForeground); }
  .source-kind { font-size: 10px; text-transform: uppercase; border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 1px 6px; color: var(--vscode-descriptionForeground); }
  .step-name { font-weight: 600; }
  .meta-row { font-size: 12px; margin-top: 4px; color: var(--vscode-descriptionForeground); }
  .arrow { text-align: center; margin: 6px 0; color: var(--vscode-descriptionForeground); }
  .link-btn { border: none; background: none; color: var(--vscode-textLink-foreground); padding: 0; cursor: pointer; font-size: 12px; text-align: left; }
  .link-btn:hover { text-decoration: underline; }
  .link-btn.missing { color: var(--vscode-testing-iconFailed); }
  .expanded { margin-top: 8px; margin-left: 10px; padding-left: 10px; border-left: 1px dashed var(--vscode-panel-border); display: grid; gap: 8px; }
  .expanded-title { font-size: 12px; margin-bottom: 2px; color: var(--vscode-descriptionForeground); }
  .empty-lane { color: var(--vscode-descriptionForeground); font-size: 13px; }
  .step-issues { margin-top: 6px; font-size: 12px; color: var(--vscode-testing-iconFailed); display: grid; gap: 4px; }
  .assertions-block { margin-top: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 6px 8px; background: var(--vscode-sideBar-background); }
  .assertions-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--vscode-descriptionForeground); }
  .assertions-list { display: flex; flex-direction: column; gap: 4px; }
  .assertions-list code { font-size: 12px; white-space: pre-wrap; word-break: break-word; }
  .issues { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; margin-bottom: 16px; background: var(--vscode-editorWidget-background); }
  .issues h2 { margin: 0 0 8px 0; font-size: 15px; }
  .issues ul { margin: 0; padding-left: 18px; }
  .issues li { margin-bottom: 4px; }
  .ok-banner { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; margin-bottom: 16px; color: var(--vscode-testing-iconPassed); background: var(--vscode-editorWidget-background); }
  .import-source { color: var(--vscode-descriptionForeground); font-size: 12px; }
  code { font-family: var(--vscode-editor-font-family); }
`;
document.head.appendChild(style);

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
