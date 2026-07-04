import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import { calendarLocator } from "./calendars.js";
import type { ToolDef } from "../register.js";

const dateRange = {
  startDate: z.string().describe("ISO 8601 date/time."),
  endDate: z.string().describe("ISO 8601 date/time. Range is capped at 366 days — narrow it for large calendars."),
};

export const calendarEventReadTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "calendar_list_events",
    description: "List events in a calendar within a bounded date range (max 366 days — required, not optional, to avoid multi-year recurrence-expansion queries hanging). Paginated.",
    inputSchema: {
      ...calendarLocator,
      ...dateRange,
      limit: z.number().int().min(1).max(1000).optional(),
      offset: z.number().int().min(0).optional(),
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("calendar-events", { op: "list", ...args }, { appName: "Calendar", timeoutMs: 20_000 }),
  },
  {
    name: "calendar_search_events",
    description: "Search events in a calendar by summary text within a bounded date range (max 366 days).",
    inputSchema: { ...calendarLocator, ...dateRange, textContains: z.string() },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("calendar-events", { op: "search", ...args }, { appName: "Calendar", timeoutMs: 20_000 }),
  },
  {
    name: "calendar_get_event",
    description: "Get a single event by its uid (stable iCalendar identifier — see calendar_list_events output).",
    inputSchema: { ...calendarLocator, uid: z.string() },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("calendar-events", { op: "get", ...args }, { appName: "Calendar" }),
  },
];
