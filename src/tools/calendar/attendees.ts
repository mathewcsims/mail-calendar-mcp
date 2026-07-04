import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import { calendarLocator } from "./calendars.js";
import type { ToolDef } from "../register.js";

export const calendarAttendeeTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "calendar_list_attendees",
    description: "List attendees on an event. Note: once any attendee is added to an event you organize, an extra entry with a null email (the organizer/self) commonly appears — flagged as isLikelyOrganizerSelf, not a bug.",
    inputSchema: { ...calendarLocator, uid: z.string() },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("calendar-attendees", { op: "list", ...args }, { appName: "Calendar" }),
  },
  {
    name: "calendar_add_attendee",
    description: "Add an attendee (by email) to an event. This has historically been an unreliable area of Calendar's AppleScript/JXA dictionary — the tool verifies the attendee actually appears on re-read before reporting success.",
    inputSchema: { ...calendarLocator, uid: z.string(), email: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args) => runJxa("calendar-attendees", { op: "add", ...args }, { appName: "Calendar", retryable: false }),
  },
  {
    name: "calendar_remove_attendee",
    description: "Remove an attendee (by email) from an event. Unverified/experimental — treat failures as a real platform limitation, not a bug in this tool.",
    inputSchema: { ...calendarLocator, uid: z.string(), email: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args) => runJxa("calendar-attendees", { op: "remove", ...args }, { appName: "Calendar", retryable: false }),
  },
];
