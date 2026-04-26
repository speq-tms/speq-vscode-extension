import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { CliResult } from "./types";

const MAX_BUFFER = 20 * 1024 * 1024;

type CliMode = "binary" | "cargo";

interface ResolvedCliCommand {
  executable: string;
  args: string[];
  command: string;
  cwd: string;
}

function readCliMode(): CliMode {
  const configured = vscode.workspace.getConfiguration("speq").get<string>("cli.mode", "binary");
  return configured === "cargo" ? "cargo" : "binary";
}

function resolveCargoProjectPath(defaultCwd: string): string {
  const configured = vscode.workspace.getConfiguration("speq").get<string>("cli.cargoProjectPath", "").trim();
  if (!configured) {
    return defaultCwd;
  }
  const resolved = path.isAbsolute(configured) ? configured : path.resolve(defaultCwd, configured);
  if (!fs.existsSync(resolved)) {
    throw new Error(`speq.cli.cargoProjectPath does not exist: ${resolved}`);
  }
  return resolved;
}

function resolveCliCommand(args: string[], cwd: string): ResolvedCliCommand {
  const mode = readCliMode();
  if (mode === "cargo") {
    const cargoCwd = resolveCargoProjectPath(cwd);
    const cargoRunArgs = vscode.workspace.getConfiguration("speq").get<string[]>("cli.cargoRunArgs", []);
    const cargoArgs = ["run", ...cargoRunArgs, "--", ...args];
    return {
      executable: "cargo",
      args: cargoArgs,
      command: ["cargo", ...cargoArgs].join(" "),
      cwd: cargoCwd
    };
  }

  const binaryPath = vscode.workspace.getConfiguration("speq").get<string>("cli.binaryPath", "speq").trim() || "speq";
  return {
    executable: binaryPath,
    args,
    command: [binaryPath, ...args].join(" "),
    cwd
  };
}

export async function runSpeq(args: string[], cwd: string): Promise<CliResult> {
  const resolved = resolveCliCommand(args, cwd);
  return new Promise((resolve, reject) => {
    execFile(resolved.executable, resolved.args, { cwd: resolved.cwd, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error) {
        const maybeError = error as NodeJS.ErrnoException & { code?: number | string };
        if (maybeError.code === "ENOENT") {
          reject(new Error(`command is not found in PATH: ${resolved.executable}`));
          return;
        }

        resolve({
          exitCode: typeof maybeError.code === "number" ? maybeError.code : 1,
          stdout: stdout ?? "",
          stderr: stderr ?? maybeError.message,
          command: resolved.command
        });
        return;
      }

      resolve({
        exitCode: 0,
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        command: resolved.command
      });
    });
  });
}
