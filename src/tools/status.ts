import { z } from "zod";
import { runJxa } from "../jxa/runner.js";
import type { ToolDef } from "./register.js";

interface StatusResult {
  appName: "Mail" | "Calendar";
  running: boolean;
  responsive: boolean;
  accountCount?: number;
  calendarCount?: number;
}

function statusTool(appName: "Mail" | "Calendar"): ToolDef<z.ZodRawShape> {
  return {
    name: `${appName.toLowerCase()}_app_status`,
    description: `Check whether ${appName}.app is running and responding to Automation. Use this before other ${appName} tools to distinguish "app not running/asleep" from a genuine data error.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async () =>
      runJxa<StatusResult>("app-status", { appName }, { appName, retryable: false }),
  };
}

export const statusTools: ToolDef<z.ZodRawShape>[] = [statusTool("Mail"), statusTool("Calendar")];
