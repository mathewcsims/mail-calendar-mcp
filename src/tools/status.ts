import { z } from "zod";
import { runJxa } from "../jxa/runner.js";
import { calendarBackend, runHelper } from "../helper/backend.js";
import type { ToolDef } from "./register.js";

interface StatusResult {
  appName: "Mail" | "Calendar";
  running: boolean;
  responsive: boolean;
  accountCount?: number;
  calendarCount?: number;
}

interface HelperStatus {
  backend: string;
  authorized: boolean;
  authorizationStatus: number;
  calendarCount: number | null;
}

function statusTool(appName: "Mail" | "Calendar"): ToolDef<z.ZodRawShape> {
  return {
    name: `${appName.toLowerCase()}_app_status`,
    description: `Check whether ${appName}.app is running and responding to Automation. Use this before other ${appName} tools to distinguish "app not running/asleep" from a genuine data error.${
      appName === "Calendar" ? " Also reports which Calendar backend is active (native EventKit helper vs JXA) and whether the helper has Calendar permission." : ""
    }`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async () => {
      const jxaStatus = await runJxa<StatusResult>("app-status", { appName }, { appName, retryable: false });
      if (appName !== "Calendar") return jxaStatus;

      const backend = calendarBackend();
      let helperStatus: HelperStatus | { error: string } | null = null;
      if (backend === "eventkit") {
        try {
          helperStatus = await runHelper<HelperStatus>({ op: "status" });
        } catch (err) {
          helperStatus = { error: String(err) };
        }
      }
      return { ...jxaStatus, calendarBackend: backend, eventkitHelper: helperStatus };
    },
  };
}

export const statusTools: ToolDef<z.ZodRawShape>[] = [statusTool("Mail"), statusTool("Calendar")];
