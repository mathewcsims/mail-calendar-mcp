import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import { helperWithJxaFallback, runHelper } from "../../helper/backend.js";
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
      "iCalendar RRULE text, e.g. 'FREQ=WEEKLY;INTERVAL=1;COUNT=5'. EventKit backend supports FREQ/INTERVAL/COUNT/UNTIL/BYDAY. Pass an empty string to clear recurrence."
    ),
};

const occurrenceFields = {
  occurrenceDate: z
    .string()
    .optional()
    .describe("ISO date of a specific occurrence of a recurring event. Omit to target the whole series (EventKit backend)."),
  span: z
    .enum(["this", "future"])
    .optional()
    .describe("For recurring events (EventKit backend): 'this' = only the targeted occurrence, 'future' = it and all later ones. Default: whole series when no occurrenceDate, single occurrence otherwise."),
};

export const calendarEventWriteTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "calendar_create_event",
    description:
      "Create a new event. Optionally set alarms at creation via alarmMinutesBefore (EventKit backend). Returns the created event including its stable uid.",
    inputSchema: {
      ...calendarLocator,
      startDate: z.string().describe("ISO 8601 date/time."),
      endDate: z.string().describe("ISO 8601 date/time."),
      alarmMinutesBefore: z.array(z.number().nonnegative()).optional().describe("Alarm offsets in minutes before start (EventKit backend)."),
      ...eventFields,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) =>
      helperWithJxaFallback(
        () => runHelper({ op: "createEvent", ...args }, { timeoutMs: 20_000 }),
        () => runJxa("calendar-events", { op: "create", ...args }, { appName: "Calendar", retryable: false, timeoutMs: 20_000 })
      ),
  },
  {
    name: "calendar_update_event",
    description:
      "Update fields on an existing event by uid. For recurring events (EventKit backend), use occurrenceDate + span to control whether the change applies to one occurrence, future occurrences, or the whole series — semantics AppleScript cannot express.",
    inputSchema: {
      ...calendarLocator,
      uid: z.string(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      alarmMinutesBefore: z.array(z.number().nonnegative()).optional().describe("Replaces ALL alarms on the event with these offsets (EventKit backend). Pass [] to remove all alarms."),
      ...occurrenceFields,
      ...eventFields,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) =>
      helperWithJxaFallback(
        () => runHelper({ op: "updateEvent", ...args }, { timeoutMs: 20_000 }),
        () => runJxa("calendar-events", { op: "update", ...args }, { appName: "Calendar", retryable: false, timeoutMs: 20_000 })
      ),
  },
  {
    name: "calendar_delete_event",
    description:
      "[IRREVERSIBLE] Delete an event by uid. Recurring events delete reliably via the native EventKit backend (default when built), including per-occurrence deletes via occurrenceDate + span — the JXA fallback silently fails on recurring events. Requires confirm:true.",
    inputSchema: { ...calendarLocator, uid: z.string(), ...occurrenceFields, confirm: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    handler: async (args: { confirm?: boolean } & Record<string, unknown>) => {
      requireConfirm(args.confirm, "delete this event");
      const { confirm: _confirm, ...rest } = args;
      return helperWithJxaFallback(
        () => runHelper({ op: "deleteEvent", ...rest }, { timeoutMs: 20_000 }),
        () => runJxa("calendar-events", { op: "delete", ...rest }, { appName: "Calendar", retryable: false, timeoutMs: 20_000 })
      );
    },
  },
  {
    name: "calendar_add_alarm",
    description: "Add a display/sound/email alarm to an event, N minutes before it starts. (JXA-based; on the EventKit backend calendar_update_event's alarmMinutesBefore is the more reliable way to manage alarms.)",
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
