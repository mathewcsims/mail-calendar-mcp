import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "../config.js";
import { log } from "../logging.js";
import { McpToolError } from "../errors.js";
import type { JxaEnvelope } from "../jxa/types.js";

// Resolves to <project root>/bin/calendar-helper from both src/ (tsx dev) and
// dist/ (production build) since both sit at the same depth.
const HELPER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "calendar-helper");

export type CalendarBackend = "eventkit" | "jxa";

/**
 * Which backend calendar tools should use. The native EventKit helper is
 * preferred whenever its binary exists (it fixes real AppleScript-bridge bugs:
 * silent no-op deletes of recurring events, broken calendar deletion, and it
 * adds per-occurrence/whole-series span semantics). MCM_CALENDAR_BACKEND=jxa
 * forces the old path, e.g. if the helper's Calendar permission was revoked.
 */
export function calendarBackend(): CalendarBackend {
  const forced = process.env.MCM_CALENDAR_BACKEND;
  if (forced === "jxa") return "jxa";
  if (forced === "eventkit") return "eventkit";
  return existsSync(HELPER_PATH) ? "eventkit" : "jxa";
}

/**
 * Route a calendar operation to the EventKit helper, falling back to JXA when
 * the helper isn't authorized. The fallback is safe even for mutating ops:
 * ensureAccess() runs inside the helper before any operation, so an
 * AUTOMATION_NOT_AUTHORIZED failure guarantees nothing was executed.
 */
export async function helperWithJxaFallback<TResult>(
  helperFn: () => Promise<TResult>,
  jxaFn: () => Promise<TResult>
): Promise<TResult> {
  if (calendarBackend() === "jxa") return jxaFn();
  try {
    return await helperFn();
  } catch (err) {
    if (err instanceof McpToolError && err.code === "AUTOMATION_NOT_AUTHORIZED") {
      log.warn("EventKit helper lacks Calendar permission — falling back to JXA for this call");
      return jxaFn();
    }
    throw err;
  }
}

export async function runHelper<TResult>(
  params: Record<string, unknown>,
  opts?: { timeoutMs?: number }
): Promise<TResult> {
  const timeoutMs = opts?.timeoutMs ?? config.readTimeoutMs;
  const started = Date.now();

  const { stdout, stderr, timedOut } = await new Promise<{ stdout: string; stderr: string; timedOut: boolean }>(
    (resolve) => {
      let timedOut = false;
      execFile(
        HELPER_PATH,
        [JSON.stringify(params)],
        { timeout: timeoutMs, maxBuffer: config.maxBufferBytes, killSignal: "SIGKILL" },
        (err, stdout, stderr) => {
          if (err && (err as NodeJS.ErrnoException & { signal?: string }).signal === "SIGKILL") {
            timedOut = true;
          }
          resolve({ stdout: stdout ?? "", stderr: stderr ?? (err ? String(err.message) : ""), timedOut });
        }
      );
    }
  );

  if (timedOut) {
    throw new McpToolError("TIMEOUT", `calendar-helper (${params.op}) timed out after ${timeoutMs}ms`);
  }

  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new McpToolError("UNEXPECTED_OSA_ERROR", `calendar-helper produced no output: ${stderr.trim()}`);
  }

  let envelope: JxaEnvelope<TResult>;
  try {
    envelope = JSON.parse(trimmed) as JxaEnvelope<TResult>;
  } catch {
    log.error("failed to parse calendar-helper output", { op: params.op, stdout: trimmed.slice(0, 500), stderr });
    throw new McpToolError("UNEXPECTED_OSA_ERROR", `calendar-helper produced unparseable output: ${trimmed.slice(0, 200)}`);
  }

  log.debug("helper call", { op: params.op, elapsedMs: Date.now() - started, ok: envelope.ok });

  if (!envelope.ok) {
    throw new McpToolError(envelope.error.code as McpToolError["code"], envelope.error.message, envelope.error.detail);
  }
  return envelope.data;
}
