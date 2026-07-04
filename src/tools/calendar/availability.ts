import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import type { ToolDef } from "../register.js";

export interface BusyInterval {
  calendarName: string | null;
  summary: string | null;
  startDate: string;
  endDate: string;
}

export function computeFreeGaps(busy: BusyInterval[], rangeStart: Date, rangeEnd: Date) {
  const sorted = busy
    .map((b) => ({ start: new Date(b.startDate), end: new Date(b.endDate) }))
    .filter((b) => !Number.isNaN(b.start.getTime()) && !Number.isNaN(b.end.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Merge overlapping/adjacent busy intervals before computing gaps.
  const merged: { start: Date; end: Date }[] = [];
  for (const b of sorted) {
    const last = merged[merged.length - 1];
    if (last && b.start.getTime() <= last.end.getTime()) {
      if (b.end.getTime() > last.end.getTime()) last.end = b.end;
    } else {
      merged.push({ ...b });
    }
  }

  const gaps: { start: string; end: string }[] = [];
  let cursor = rangeStart;
  for (const interval of merged) {
    if (interval.start.getTime() > cursor.getTime()) {
      gaps.push({ start: cursor.toISOString(), end: interval.start.toISOString() });
    }
    if (interval.end.getTime() > cursor.getTime()) cursor = interval.end;
  }
  if (cursor.getTime() < rangeEnd.getTime()) {
    gaps.push({ start: cursor.toISOString(), end: rangeEnd.toISOString() });
  }
  return gaps;
}

export const calendarAvailabilityTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "calendar_get_availability",
    description:
      "Compute free/busy gaps across one or more calendars within a bounded date range (max 366 days). This is computed locally from calendar_list_events-equivalent data, not a native Calendar.app feature — Calendar's scripting dictionary has no free/busy API.",
    inputSchema: {
      calendars: z
        .array(z.object({ calendarName: z.string().optional(), calendarIndex: z.number().int().optional() }))
        .min(1)
        .describe("Calendars to check busy time across."),
      startDate: z.string(),
      endDate: z.string(),
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args: Record<string, unknown>) => {
      const { calendars, startDate, endDate } = args as { calendars: unknown[]; startDate: string; endDate: string };
      const result = await runJxa<{ intervals: BusyInterval[] }>(
        "calendar-events",
        { op: "listBusyIntervals", calendars, startDate, endDate },
        { appName: "Calendar", timeoutMs: 20_000 }
      );
      const gaps = computeFreeGaps(result.intervals, new Date(startDate), new Date(endDate));
      return { busy: result.intervals, free: gaps };
    },
  },
];
