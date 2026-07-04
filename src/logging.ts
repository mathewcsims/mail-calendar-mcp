import { config } from "./config.js";

// All logging goes to stderr — stdout is the MCP stdio transport channel and must
// never carry anything but protocol frames.
function write(level: string, message: string, fields?: Record<string, unknown>) {
  const line = { ts: new Date().toISOString(), level, message, ...fields };
  process.stderr.write(JSON.stringify(line) + "\n");
}

export const log = {
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
  debug: (message: string, fields?: Record<string, unknown>) => {
    if (config.verbose) write("debug", message, fields);
  },
};
