import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import { helperWithJxaFallback, runHelper } from "../../helper/backend.js";
import { calendarLocator } from "./calendars.js";
import type { ToolDef } from "../register.js";

const dateRange = {
  startDate: z.string().describe("ISO 8601 date/time."),
  endDate: z.string().describe("ISO 8601 date/time. Range is capped at 366 days — narrow it for large calendars."),
};

export const calendarEventReadTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "calendar_list_events",
    description:
      "List events in a calendar within a bounded date range (max 366 days — required, not optional, to avoid multi-year recurrence-expansion queries hanging). Paginated. Omit the calendar locator entirely (EventKit backend) to search across ALL calendars at once.",
    inputSchema: {
      ...calendarLocator,
      ...dateRange,
      limit: z.number().int().min(1).max(1000).optional(),
      offset: z.number().int().min(0).optional(),
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) =>
      helperWithJxaFallback(
        () => runHelper({ op: "listEvents", ...args }, { timeoutMs: 20_000 }),
        () => runJxa("calendar-events", { op: "list", ...args }, { appName: "Calendar", timeoutMs: 20_000 })
      ),
  },
  {
    name: "calendar_search_events",
    description: "Search events by summary text within a bounded date range (max 366 days). Omit the calendar locator (EventKit backend) to search all calendars.",
    inputSchema: { ...calendarLocator, ...dateRange, textContains: z.string() },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) =>
      helperWithJxaFallback(
        () => runHelper({ op: "listEvents", ...args }, { timeoutMs: 20_000 }),
        () => runJxa("calendar-events", { op: "search", ...args }, { appName: "Calendar", timeoutMs: 20_000 })
      ),
  },
  {
    name: "calendar_get_event",
    description:
      "Get a single event by its uid (stable iCalendar identifier). EventKit backend also returns attendees, alarms, and recurrence detail; pass occurrenceDate to fetch a specific occurrence of a recurring event.",
    inputSchema: {
      ...calendarLocator,
      uid: z.string(),
      occurrenceDate: z.string().optional().describe("ISO date of a specific occurrence of a recurring event (EventKit backend)."),
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) =>
      helperWithJxaFallback(
        () => runHelper({ op: "getEvent", ...args }),
        () => runJxa("calendar-events", { op: "get", ...args }, { appName: "Calendar" })
      ),
  },
];
