import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import { helperWithJxaFallback, runHelper } from "../../helper/backend.js";
import { requireConfirm } from "../register.js";
import type { ToolDef } from "../register.js";

const calendarLocator = {
  calendarName: z.string().optional().describe("Calendar name. Ambiguous if duplicated (common on multi-account setups) — use calendarId (preferred) or calendarIndex instead in that case."),
  calendarId: z.string().optional().describe("Stable calendar identifier from calendar_list_calendars (EventKit backend). Preferred over calendarName when names are duplicated."),
  calendarIndex: z.number().int().optional().describe("Position from calendar_list_calendars (JXA backend only). Stable only for the current Calendar.app process."),
};

export const calendarCalendarTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "calendar_list_calendars",
    description:
      "List every calendar across all accounts (iCloud/Google/Exchange/etc.). With the native EventKit backend (default when built), each calendar includes a stable calendarId and its source account; use calendarId to disambiguate duplicate names.",
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async () =>
      helperWithJxaFallback(
        () => runHelper({ op: "listCalendars" }),
        () => runJxa("calendar-calendars", { op: "list" }, { appName: "Calendar" })
      ),
  },
  {
    name: "calendar_list_sources",
    description:
      "List calendar sources/accounts (iCloud, Google, Local, etc.) — useful for choosing where calendar_create_calendar puts a new calendar. Native EventKit backend only.",
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async () => runHelper({ op: "listSources" }),
  },
  {
    name: "calendar_create_calendar",
    description:
      "Create a new calendar. Optionally pass sourceName (see calendar_list_sources) to choose which account it lives in; defaults to the same source as your default calendar.",
    inputSchema: { name: z.string(), sourceName: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) =>
      helperWithJxaFallback(
        () => runHelper({ op: "createCalendar", ...args }, { timeoutMs: 20_000 }),
        () => runJxa("calendar-calendars", { op: "create", ...args }, { appName: "Calendar", retryable: false, timeoutMs: 20_000 })
      ),
  },
  {
    name: "calendar_rename_calendar",
    description: "Rename an existing calendar.",
    inputSchema: { ...calendarLocator, newName: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args) =>
      helperWithJxaFallback(
        () => runHelper({ op: "renameCalendar", ...args }),
        () => runJxa("calendar-calendars", { op: "rename", ...args }, { appName: "Calendar", retryable: false })
      ),
  },
  {
    name: "calendar_delete_calendar",
    description:
      "[IRREVERSIBLE] Permanently delete a calendar and everything in it. Reliable via the native EventKit backend (default when built); the JXA fallback is confirmed broken for this operation. Requires confirm:true.",
    inputSchema: { ...calendarLocator, confirm: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    handler: async (args: { confirm?: boolean } & Record<string, unknown>) => {
      requireConfirm(args.confirm, "delete this calendar and everything in it");
      const { confirm: _confirm, ...rest } = args;
      return helperWithJxaFallback(
        () => runHelper({ op: "deleteCalendar", ...rest }, { timeoutMs: 20_000 }),
        () => runJxa("calendar-calendars", { op: "delete", ...rest }, { appName: "Calendar", retryable: false, timeoutMs: 20_000 })
      );
    },
  },
];

export { calendarLocator };
