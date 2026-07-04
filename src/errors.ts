export type ErrorCode =
  | "APP_NOT_RUNNING"
  | "AUTOMATION_NOT_AUTHORIZED"
  | "ACCOUNT_OFFLINE_OR_ASLEEP"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "PLATFORM_LIMITATION"
  | "INVALID_INPUT"
  | "UNEXPECTED_OSA_ERROR";

export class McpToolError extends Error {
  readonly code: ErrorCode;
  readonly detail?: unknown;

  constructor(code: ErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
    this.detail = detail;
  }

  toContent() {
    return {
      code: this.code,
      message: this.message,
      detail: this.detail,
    };
  }
}

// Raw OSA error numbers we recognize, mapped to our taxonomy.
// -600: application isn't running, -609: connection invalid (app quit mid-call)
// -1728: no such object, -1743: user cancelled / not authorized for Automation
const OSA_NUMBER_MAP: Record<string, ErrorCode> = {
  "-600": "APP_NOT_RUNNING",
  "-609": "APP_NOT_RUNNING",
  "-1728": "NOT_FOUND",
  "-1743": "AUTOMATION_NOT_AUTHORIZED",
  "-10004": "AUTOMATION_NOT_AUTHORIZED",
};

/** Maps a raw stderr blob from a failed osascript invocation into our error taxonomy. */
export function mapOsaError(stderr: string): McpToolError {
  const numberMatch = stderr.match(/-(\d{3,5})/);
  if (numberMatch) {
    const code = OSA_NUMBER_MAP[`-${numberMatch[1]}`];
    if (code) {
      return new McpToolError(code, stderr.trim(), { osaError: `-${numberMatch[1]}` });
    }
  }
  if (/not authorized|not allowed to send Apple events/i.test(stderr)) {
    return new McpToolError("AUTOMATION_NOT_AUTHORIZED", stderr.trim());
  }
  if (/isn.t running/i.test(stderr)) {
    return new McpToolError("APP_NOT_RUNNING", stderr.trim());
  }
  return new McpToolError("UNEXPECTED_OSA_ERROR", stderr.trim());
}
