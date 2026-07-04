import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import { requireConfirm } from "../register.js";
import { calendarLocator } from "./calendars.js";
import type { ToolDef } from "../register.js";

const eventFields = {
  summary: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  alldayEvent: z.boolean().optional(),
  recurrence: z
    .string()
    .optional()
    .describe(
      "Raw iCalendar RRULE-style text, e.g. 'FREQ=WEEKLY;INTERVAL=1;COUNT=5'. Editing recurrence on an already-recurring event is a known-flaky area — the tool verifies the change took effect and reports PLATFORM_LIMITATION if not."
    ),
};

export const calendarEventWriteTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "calendar_create_event",
    description:
      "Create a new event. Verifies the event actually exists (by uid) after creation before reporting success — Calendar's scripting dictionary has known flaky spots for event creation.",
    inputSchema: {
      ...calendarLocator,
      startDate: z.string().describe("ISO 8601 date/time."),
      endDate: z.string().describe("ISO 8601 date/time."),
      ...eventFields,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("calendar-events", { op: "create", ...args }, { appName: "Calendar", retryable: false, timeoutMs: 20_000 }),
  },
  {
    name: "calendar_update_event",
    description:
      "Update fields on an existing event by uid. Verifies changed fields actually took effect on re-read before reporting success — recurrence edits on already-recurring events are a known-flaky area.",
    inputSchema: {
      ...calendarLocator,
      uid: z.string(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      ...eventFields,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("calendar-events", { op: "update", ...args }, { appName: "Calendar", retryable: false, timeoutMs: 20_000 }),
  },
  {
    name: "calendar_delete_event",
    description:
      "[IRREVERSIBLE] Delete an event by uid. Confirmed via testing: deleting a RECURRING event silently reports success without actually deleting it on this platform — this tool detects that and returns PLATFORM_LIMITATION instead of a false success; delete recurring events manually in Calendar.app (where you can choose 'this event' vs 'all future events'). Requires confirm:true.",
    inputSchema: { ...calendarLocator, uid: z.string(), confirm: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    handler: async (args: { confirm?: boolean } & Record<string, unknown>) => {
      requireConfirm(args.confirm, "delete this event");
      const { confirm: _confirm, ...rest } = args;
      return runJxa("calendar-events", { op: "delete", ...rest }, { appName: "Calendar", retryable: false, timeoutMs: 20_000 });
    },
  },
  {
    name: "calendar_add_alarm",
    description: "Add a display/sound/email alarm to an event, N minutes before it starts.",
    inputSchema: {
      ...calendarLocator,
      uid: z.string(),
      kind: z.enum(["display", "sound", "mail"]).optional().describe("Defaults to display."),
      minutesBefore: z.number().nonnegative(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("calendar-events", { op: "addAlarm", ...args }, { appName: "Calendar", retryable: false }),
  },
  {
    name: "calendar_list_alarms",
    description: "List all alarms (display/sound/mail) on an event.",
    inputSchema: { ...calendarLocator, uid: z.string() },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("calendar-events", { op: "listAlarms", ...args }, { appName: "Calendar" }),
  },
  {
    name: "calendar_remove_all_alarms",
    description: "Remove every alarm from an event.",
    inputSchema: { ...calendarLocator, uid: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("calendar-events", { op: "removeAllAlarms", ...args }, { appName: "Calendar", retryable: false }),
  },
];
