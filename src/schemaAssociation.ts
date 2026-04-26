import * as vscode from "vscode";

type YamlSchemas = Record<string, string | string[]>;

export async function ensureYamlSchemaAssociations(context: vscode.ExtensionContext, output: vscode.OutputChannel): Promise<void> {
  const yamlConfig = vscode.workspace.getConfiguration("yaml");
  const current = (yamlConfig.get<YamlSchemas>("schemas") ?? {}) as YamlSchemas;

  const schemaMappings: YamlSchemas = {
    [vscode.Uri.joinPath(context.extensionUri, "schemas", "speq-test.schema.json").toString()]: [
      "**/suites/**/*.yaml",
      "**/suites/**/*.yml"
    ],
    [vscode.Uri.joinPath(context.extensionUri, "schemas", "speq-suite-init.schema.json").toString()]: [
      "**/suites/**/init.yaml",
      "**/suites/**/init.yml"
    ],
    [vscode.Uri.joinPath(context.extensionUri, "schemas", "speq-module.schema.json").toString()]: [
      "**/modules/**/*.yaml",
      "**/modules/**/*.yml"
    ]
  };

  let changed = false;
  const merged: YamlSchemas = { ...current };
  for (const [schemaUri, globs] of Object.entries(schemaMappings)) {
    if (JSON.stringify(merged[schemaUri]) !== JSON.stringify(globs)) {
      merged[schemaUri] = globs;
      changed = true;
    }
  }

  if (!changed) {
    return;
  }

  try {
    await yamlConfig.update("schemas", merged, vscode.ConfigurationTarget.Workspace);
    output.appendLine("speq: YAML schema associations were updated in workspace settings.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`speq: failed to update yaml.schemas setting: ${message}`);
  }
}
