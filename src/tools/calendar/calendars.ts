import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import { requireConfirm } from "../register.js";
import type { ToolDef } from "../register.js";

const calendarLocator = {
  calendarName: z.string().optional().describe("Calendar name. Ambiguous if duplicated (common on multi-account setups) — use calendarIndex instead in that case."),
  calendarIndex: z.number().int().optional().describe("Position from calendar_list_calendars, for disambiguating duplicate calendar names. Stable only for the current Calendar.app process."),
};

export const calendarCalendarTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "calendar_list_calendars",
    description: "List every calendar across all accounts (iCloud/Google/Exchange/etc.) with its index (use for calendar_* tools when names are ambiguous), writability, and description.",
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async () => runJxa("calendar-calendars", { op: "list" }, { appName: "Calendar" }),
  },
  {
    name: "calendar_create_calendar",
    description: "Create a new calendar. Verifies the calendar actually exists after creation before reporting success (Calendar's scripting dictionary has known flaky spots).",
    inputSchema: { name: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("calendar-calendars", { op: "create", ...args }, { appName: "Calendar", retryable: false, timeoutMs: 20_000 }),
  },
  {
    name: "calendar_rename_calendar",
    description: "Rename an existing calendar.",
    inputSchema: { ...calendarLocator, newName: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("calendar-calendars", { op: "rename", ...args }, { appName: "Calendar", retryable: false }),
  },
  {
    name: "calendar_delete_calendar",
    description:
      "[IRREVERSIBLE] Permanently delete a calendar and everything in it. Confirmed via testing to be unreliable via scripting on at least some calendars — expect a PLATFORM_LIMITATION error and delete manually in Calendar.app as a fallback. Requires confirm:true.",
    inputSchema: { ...calendarLocator, confirm: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    handler: async (args: { confirm?: boolean } & Record<string, unknown>) => {
      requireConfirm(args.confirm, "delete this calendar and everything in it");
      const { confirm: _confirm, ...rest } = args;
      return runJxa("calendar-calendars", { op: "delete", ...rest }, { appName: "Calendar", retryable: false, timeoutMs: 20_000 });
    },
  },
];

export { calendarLocator };
