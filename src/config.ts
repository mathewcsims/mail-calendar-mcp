export const config = {
  /** Default per-call timeout for read operations against Mail/Calendar. */
  readTimeoutMs: Number(process.env.MCM_READ_TIMEOUT_MS ?? 15_000),
  /** Default per-call timeout for write operations (never auto-retried). */
  writeTimeoutMs: Number(process.env.MCM_WRITE_TIMEOUT_MS ?? 25_000),
  /** Cap on stdout captured from an osascript invocation. */
  maxBufferBytes: Number(process.env.MCM_MAX_BUFFER_BYTES ?? 32 * 1024 * 1024),
  /** Verbose logging (includes redacted-by-default fields) for local debugging only. */
  verbose: process.env.MCM_VERBOSE === "1",
};
