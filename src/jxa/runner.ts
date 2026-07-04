import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "../config.js";
import { log } from "../logging.js";
import { McpToolError, mapOsaError } from "../errors.js";
import type { JxaEnvelope } from "./types.js";

const SCRIPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "scripts");

/** App names we know how to activate for the app-not-running retry path. */
export type AppName = "Mail" | "Calendar";

export interface RunJxaOptions {
  /** App this call targets, used only for the auto-relaunch-and-retry-once path. */
  appName: AppName;
  /** Read calls may auto-retry once after relaunching a not-running app. Writes must not (avoid double-send/double-delete). */
  retryable?: boolean;
  timeoutMs?: number;
}

function execFileAsync(
  file: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    let timedOut = false;
    const child = execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: config.maxBufferBytes, killSignal: "SIGKILL" },
      (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException & { killed?: boolean; signal?: string }).signal === "SIGKILL") {
          timedOut = true;
        }
        resolve({ stdout: stdout ?? "", stderr: stderr ?? (err ? String(err.message) : ""), timedOut });
      }
    );
    child.on("error", () => {
      /* surfaced via the exec callback above */
    });
  });
}

async function activateApp(appName: AppName): Promise<void> {
  await execFileAsync("osascript", ["-e", `tell application "${appName}" to activate`], 10_000);
}

/**
 * Invokes a fixed JXA script under src/jxa/scripts/<scriptName>.js with a single
 * JSON-encoded argv element. No AppleScript source is ever built from caller input —
 * scriptName resolves only within SCRIPTS_DIR and params travel purely as JSON data,
 * so there is no shell or AppleScript-quoting injection surface.
 */
export async function runJxa<TResult>(
  scriptName: string,
  params: Record<string, unknown>,
  opts: RunJxaOptions
): Promise<TResult> {
  const scriptPath = path.join(SCRIPTS_DIR, `${scriptName}.js`);
  const timeoutMs = opts.timeoutMs ?? config.readTimeoutMs;
  const argJson = JSON.stringify(params ?? {});

  const attempt = async (): Promise<{ stdout: string; stderr: string; timedOut: boolean }> =>
    execFileAsync("osascript", ["-l", "JavaScript", scriptPath, argJson], timeoutMs);

  const started = Date.now();
  let result = await attempt();

  if (result.timedOut) {
    log.debug("jxa timeout", { scriptName, elapsedMs: Date.now() - started });
    throw new McpToolError("TIMEOUT", `${scriptName} timed out after ${timeoutMs}ms`);
  }

  let envelope = parseEnvelope<TResult>(scriptName, result.stdout, result.stderr);

  if (
    !envelope.ok &&
    envelope.error.code === "APP_NOT_RUNNING" &&
    opts.retryable !== false
  ) {
    log.debug("jxa app not running, relaunching and retrying once", { scriptName, appName: opts.appName });
    await activateApp(opts.appName);
    result = await attempt();
    if (result.timedOut) {
      throw new McpToolError("TIMEOUT", `${scriptName} timed out after ${timeoutMs}ms (retry)`);
    }
    envelope = parseEnvelope<TResult>(scriptName, result.stdout, result.stderr);
  }

  log.debug("jxa call", { scriptName, elapsedMs: Date.now() - started, ok: envelope.ok });

  if (!envelope.ok) {
    throw new McpToolError(
      envelope.error.code as McpToolError["code"],
      envelope.error.message,
      envelope.error.detail
    );
  }
  return envelope.data;
}

export function parseEnvelope<TResult>(
  scriptName: string,
  stdout: string,
  stderr: string
): JxaEnvelope<TResult> {
  const trimmed = stdout.trim();
  if (!trimmed) {
    const mapped = mapOsaError(stderr || "empty output from osascript");
    return { ok: false, error: mapped.toContent() };
  }
  try {
    const parsed = JSON.parse(trimmed) as JxaEnvelope<TResult>;
    return parsed;
  } catch {
    log.error("failed to parse JXA output as JSON", { scriptName, stdout: trimmed.slice(0, 500), stderr });
    const mapped = mapOsaError(stderr || trimmed);
    return { ok: false, error: mapped.toContent() };
  }
}
