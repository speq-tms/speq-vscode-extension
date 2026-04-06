import { execFile } from "child_process";
import { CliResult } from "./types";

const MAX_BUFFER = 20 * 1024 * 1024;

export async function runSpeq(args: string[], cwd: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    execFile("speq", args, { cwd, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error) {
        const maybeError = error as NodeJS.ErrnoException & { code?: number | string };
        if (maybeError.code === "ENOENT") {
          reject(new Error("speq CLI is not found in PATH"));
          return;
        }

        resolve({
          exitCode: typeof maybeError.code === "number" ? maybeError.code : 1,
          stdout: stdout ?? "",
          stderr: stderr ?? maybeError.message
        });
        return;
      }

      resolve({
        exitCode: 0,
        stdout: stdout ?? "",
        stderr: stderr ?? ""
      });
    });
  });
}
