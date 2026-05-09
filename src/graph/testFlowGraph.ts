import * as fs from "fs";
import * as path from "path";
import { parse } from "yaml";
import { SpeqRootInfo } from "../types";

type StepType = "api" | "use" | string;

interface ImportSpec {
  module?: string;
  alias?: string;
}

interface AssertionSpec {
  type?: string;
  ref?: string;
  [key: string]: unknown;
}

interface StepSpec {
  type?: StepType;
  name?: string;
  action?: string;
  ref?: string;
  assert?: AssertionSpec[];
  steps?: StepSpec[];
}

interface ModuleActionDetailed {
  steps?: StepSpec[];
}

type ModuleActionValue = StepSpec[] | ModuleActionDetailed;

interface ModuleSpec {
  actions?: Record<string, ModuleActionValue>;
}

interface ReusableSpec {
  steps?: StepSpec[];
}

interface TestSpec {
  id?: string;
  title?: string;
  description?: string;
  tags?: string[];
  markers?: string[];
  imports?: ImportSpec[];
  setup?: StepSpec[];
  steps?: StepSpec[];
  cleanup?: StepSpec[];
}

export interface FlowRefLink {
  label: string;
  path: string;
  exists: boolean;
}

export type StepSourceKind = "test" | "suiteInit" | "moduleAction" | "reusable";

export interface FlowStepNode {
  id: string;
  lane: "setup" | "steps" | "cleanup" | "expanded";
  title: string;
  stepType: string;
  sourcePath: string;
  sourceKind: StepSourceKind;
  assertions: AssertionSpec[];
  schemaRefs: FlowRefLink[];
  issues: string[];
  expandedSteps: FlowStepNode[];
}

export interface FlowIssue {
  message: string;
  path?: string;
}

interface SuiteInitSpec {
  suite?: {
    imports?: ImportSpec[];
    beforeAll?: StepSpec[];
    beforeEach?: StepSpec[];
    afterEach?: StepSpec[];
    afterAll?: StepSpec[];
  };
}

export interface TestFlowGraphModel {
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
}

function parseYamlFile<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf8");
  return parse(content) as T;
}

function moduleAlias(importSpec: ImportSpec): string {
  const explicit = (importSpec.alias ?? "").trim();
  if (explicit) {
    return explicit;
  }
  const moduleValue = (importSpec.module ?? "").trim();
  const base = moduleValue.split("/").pop() ?? moduleValue;
  return base.replace(/\.(yaml|yml)$/i, "");
}

function modulePathCandidates(modulesDir: string, moduleName: string): string[] {
  const target = path.join(modulesDir, moduleName);
  if (/\.(yaml|yml)$/i.test(moduleName)) {
    return [target];
  }
  return [target, `${target}.yaml`, `${target}.yml`];
}

function resolveModulePath(modulesDir: string, moduleName: string): string | undefined {
  return modulePathCandidates(modulesDir, moduleName).find((candidate) => fs.existsSync(candidate));
}

function resolveSchemaPath(schemasDir: string, schemaRef: string): string {
  const rel = schemaRef.trim();
  const withExt = /\.[A-Za-z0-9]+$/.test(rel);
  const candidates = withExt ? [rel] : [rel, `${rel}.json`, `${rel}.yaml`, `${rel}.yml`];
  const resolved = candidates.map((item) => path.join(schemasDir, item)).find((item) => fs.existsSync(item));
  return resolved ?? path.join(schemasDir, rel);
}

function resolveReusablePath(stepRef: string, testPath: string, root: SpeqRootInfo): string {
  if (path.isAbsolute(stepRef)) {
    return stepRef;
  }
  const testDir = path.dirname(testPath);
  const fromTest = path.resolve(testDir, stepRef);
  if (fs.existsSync(fromTest)) {
    return fromTest;
  }
  return path.resolve(root.speqRoot, stepRef);
}

interface BuildContext {
  root: SpeqRootInfo;
  testPath: string;
  importsByAlias: Map<string, ImportSpec>;
  moduleCache: Map<string, ModuleSpec>;
  visitedRefs: Set<string>;
  issues: FlowIssue[];
}

function schemaRefsFromStep(step: StepSpec, root: SpeqRootInfo): FlowRefLink[] {
  const assertions = step.assert ?? [];
  return assertions
    .filter((item) => item?.type === "schema" && typeof item.ref === "string" && item.ref.trim().length > 0)
    .map((item, index) => {
      const resolved = resolveSchemaPath(root.schemasDir, item.ref as string);
      return {
        label: `schema ${index + 1}`,
        path: resolved,
        exists: fs.existsSync(resolved)
      };
    });
}

function resolveActionSteps(step: StepSpec, ctx: BuildContext): { sourcePath: string; steps: StepSpec[] } | undefined {
  const actionValue = (step.action ?? "").trim();
  if (!actionValue) {
    return undefined;
  }
  const split = actionValue.split(".");
  if (split.length !== 2) {
    return undefined;
  }

  const [alias, actionName] = split;
  const importSpec = ctx.importsByAlias.get(alias);
  if (!importSpec?.module) {
    ctx.issues.push({
      message: `Action '${actionValue}' cannot be resolved: alias '${alias}' is not imported.`,
      path: ctx.testPath
    });
    return undefined;
  }

  const modulePath = resolveModulePath(ctx.root.modulesDir, importSpec.module);
  if (!modulePath) {
    ctx.issues.push({
      message: `Module '${importSpec.module}' for action '${actionValue}' was not found.`,
      path: path.join(ctx.root.modulesDir, importSpec.module)
    });
    return undefined;
  }

  let module = ctx.moduleCache.get(modulePath);
  if (!module) {
    module = parseYamlFile<ModuleSpec>(modulePath);
    ctx.moduleCache.set(modulePath, module);
  }

  const actionSpec = module.actions?.[actionName];
  if (!actionSpec) {
    ctx.issues.push({
      message: `Action '${actionName}' is missing in module '${importSpec.module}'.`,
      path: modulePath
    });
    return undefined;
  }

  if (Array.isArray(actionSpec)) {
    return { sourcePath: modulePath, steps: actionSpec };
  }
  return { sourcePath: modulePath, steps: actionSpec.steps ?? [] };
}

function resolveReusableSteps(step: StepSpec, ctx: BuildContext): { sourcePath: string; steps: StepSpec[] } | undefined {
  const refValue = (step.ref ?? "").trim();
  if (!refValue) {
    return undefined;
  }
  const reusablePath = resolveReusablePath(refValue, ctx.testPath, ctx.root);
  if (!fs.existsSync(reusablePath)) {
    ctx.issues.push({
      message: `Reusable reference '${refValue}' was not found.`,
      path: reusablePath
    });
    return undefined;
  }
  const reusable = parseYamlFile<ReusableSpec>(reusablePath);
  return { sourcePath: reusablePath, steps: reusable.steps ?? [] };
}

function buildStepNodes(
  steps: StepSpec[],
  lane: "setup" | "steps" | "cleanup" | "expanded",
  ctx: BuildContext,
  sourcePath: string,
  scopeId: string,
  sourceKind: StepSourceKind
): FlowStepNode[] {
  return steps.map((step, index) => {
    const stepId = `${scopeId}.${lane}.${index + 1}`;
    const displayType = (step.type ?? "unknown").toString();
    const displayName = (step.name ?? `${displayType} step ${index + 1}`).toString();
    const schemaRefs = schemaRefsFromStep(step, ctx.root);
    const issues: string[] = [];
    for (const schemaRef of schemaRefs) {
      if (!schemaRef.exists) {
        const warning = `Schema file not found: ${schemaRef.path}`;
        issues.push(warning);
        ctx.issues.push({ message: warning, path: schemaRef.path });
      }
    }
    const expandedSteps: FlowStepNode[] = [];

    if (displayType === "use") {
      const actionResolved = resolveActionSteps(step, ctx);
      const refResolved = resolveReusableSteps(step, ctx);
      const expansion = actionResolved ?? refResolved;
      const expansionSourceKind: StepSourceKind = actionResolved ? "moduleAction" : "reusable";
      if (expansion) {
        const visitKey = `${expansion.sourcePath}::${displayName}`;
        if (!ctx.visitedRefs.has(visitKey)) {
          ctx.visitedRefs.add(visitKey);
          expandedSteps.push(...buildStepNodes(expansion.steps, "expanded", ctx, expansion.sourcePath, stepId, expansionSourceKind));
        }
      }
    }

    return {
      id: stepId,
      lane,
      title: displayName,
      stepType: displayType,
      sourcePath,
      sourceKind,
      assertions: step.assert ?? [],
      schemaRefs,
      issues,
      expandedSteps
    };
  });
}

function collectSuiteInitChain(suitesDir: string, testPath: string): string[] {
  const chain: string[] = [];
  let current = path.dirname(testPath);
  while (current.startsWith(suitesDir)) {
    const initYaml = path.join(current, "init.yaml");
    const initYml = path.join(current, "init.yml");
    if (fs.existsSync(initYaml)) {
      chain.push(initYaml);
    } else if (fs.existsSync(initYml)) {
      chain.push(initYml);
    }
    if (current === suitesDir) {
      break;
    }
    current = path.dirname(current);
  }
  return chain.reverse();
}

function loadSuiteHooks(chain: string[], issues: FlowIssue[]): {
  imports: ImportSpec[];
  beforeAll: StepSpec[];
  beforeEach: StepSpec[];
  afterEach: StepSpec[];
  afterAll: StepSpec[];
} {
  const imports: ImportSpec[] = [];
  const beforeEach: StepSpec[] = [];
  const afterEach: StepSpec[] = [];
  let beforeAll: StepSpec[] = [];
  let afterAll: StepSpec[] = [];

  for (const initPath of chain) {
    try {
      const parsed = parseYamlFile<SuiteInitSpec>(initPath);
      const suite = parsed.suite ?? {};
      imports.push(...(suite.imports ?? []));
      beforeEach.push(...(suite.beforeEach ?? []));
      afterEach.push(...(suite.afterEach ?? []));
      beforeAll = suite.beforeAll ?? [];
      afterAll = suite.afterAll ?? [];
    } catch (error) {
      issues.push({
        message: `Failed to parse suite init file: ${error instanceof Error ? error.message : String(error)}`,
        path: initPath
      });
    }
  }

  return {
    imports,
    beforeAll,
    beforeEach,
    afterEach: [...afterEach].reverse(),
    afterAll
  };
}

export function buildTestFlowGraphModel(root: SpeqRootInfo, testPath: string): TestFlowGraphModel {
  const absoluteTestPath = path.isAbsolute(testPath) ? testPath : path.resolve(root.speqRoot, testPath);
  const parsed = parseYamlFile<TestSpec>(absoluteTestPath);
  const issues: FlowIssue[] = [];
  const suiteInitChain = collectSuiteInitChain(root.suitesDir, absoluteTestPath);
  const suiteHooks = loadSuiteHooks(suiteInitChain, issues);
  const imports = [...suiteHooks.imports, ...(parsed.imports ?? [])];
  const importsByAlias = new Map<string, ImportSpec>();
  for (const item of imports) {
    if (!item.module) {
      continue;
    }
    importsByAlias.set(moduleAlias(item), item);
  }

  const ctx: BuildContext = {
    root,
    testPath: absoluteTestPath,
    importsByAlias,
    moduleCache: new Map<string, ModuleSpec>(),
    visitedRefs: new Set<string>(),
    issues
  };

  const relTestPath = path.relative(root.speqRoot, absoluteTestPath) || absoluteTestPath;
  const testTags = parsed.tags?.length ? parsed.tags : parsed.markers ?? [];
  const suiteInitSource = suiteInitChain[suiteInitChain.length - 1] ?? absoluteTestPath;
  const beforeAllNodes = buildStepNodes(suiteHooks.beforeAll, "setup", ctx, suiteInitSource, `${relTestPath}.suite.beforeAll`, "suiteInit");
  const beforeEachNodes = buildStepNodes(
    suiteHooks.beforeEach,
    "setup",
    ctx,
    suiteInitSource,
    `${relTestPath}.suite.beforeEach`,
    "suiteInit"
  );
  const testSetupNodes = buildStepNodes(parsed.setup ?? [], "setup", ctx, absoluteTestPath, relTestPath, "test");
  const testBodyNodes = buildStepNodes(parsed.steps ?? [], "steps", ctx, absoluteTestPath, relTestPath, "test");
  const testCleanupNodes = buildStepNodes(parsed.cleanup ?? [], "cleanup", ctx, absoluteTestPath, relTestPath, "test");
  const afterEachNodes = buildStepNodes(suiteHooks.afterEach, "cleanup", ctx, suiteInitSource, `${relTestPath}.suite.afterEach`, "suiteInit");
  const afterAllNodes = buildStepNodes(suiteHooks.afterAll, "cleanup", ctx, suiteInitSource, `${relTestPath}.suite.afterAll`, "suiteInit");

  return {
    testId: parsed.id ?? relTestPath,
    testTitle: parsed.title ?? relTestPath,
    testDescription: parsed.description ?? "",
    testTags,
    testPath: absoluteTestPath,
    rootPath: root.speqRoot,
    imports: imports
      .filter((item) => Boolean(item.module))
      .map((item) => ({
        alias: moduleAlias(item),
        module: item.module as string,
        source: (parsed.imports ?? []).includes(item) ? "test" : "suiteInit"
      })),
    setupFlow: [...beforeAllNodes, ...beforeEachNodes, ...testSetupNodes],
    testBodyFlow: testBodyNodes,
    teardownFlow: [...testCleanupNodes, ...afterEachNodes, ...afterAllNodes],
    issues
  };
}
