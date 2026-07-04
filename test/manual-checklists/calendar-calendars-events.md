# Calendar: calendars, events, alarms

All destructive/mutating tests should run against the dedicated `MCP-Scratch` calendar (local, "On My Mac").

| # | Precondition | Tool call | Expected result | Pass/Fail |
|---|---|---|---|---|
| 1 | — | `calendar_list_calendars` | Every calendar listed, including duplicate names (e.g. two "Calendar" / two "Birthdays" on this machine), each with a distinct `index` | [ ] |
| 2 | — | `calendar_create_calendar` | New calendar appears in Calendar.app's sidebar | [ ] |
| 3 | Calendar from #2 | `calendar_rename_calendar` | Renamed in Calendar.app's sidebar | [ ] |
| 4 | Calendar from #2 | `calendar_delete_calendar` with `confirm:true` | Confirm actual behavior — may succeed or return `PLATFORM_LIMITATION` depending on account type per README | [ ] |
| 5 | — | `calendar_list_events` with **no** date range | Confirm the schema rejects this (startDate/endDate required) rather than hanging | [ ] |
| 6 | — | `calendar_list_events` with a >366 day range | Rejected with `INVALID_INPUT` about the range cap | [ ] |
| 7 | — | `calendar_create_event` | Event appears in Calendar.app at the right time/date, `calendar_get_event` by the returned `uid` matches | [ ] |
| 8 | Event from #7 | `calendar_update_event` changing `summary`/`location` | Change reflected in Calendar.app | [ ] |
| 9 | Event from #7 | `calendar_update_event` setting `recurrence` | Recurrence appears correctly in Calendar.app; re-verify since recurrence edits are flagged flaky | [ ] |
| 10 | A **non-recurring** event | `calendar_delete_event` with `confirm:true` | Event actually gone from Calendar.app and from `calendar_get_event` | [ ] |
| 11 | A **recurring** event (has `recurrence` set) | `calendar_delete_event` with `confirm:true` | **Expected to fail** with `PLATFORM_LIMITATION` per README (confirmed bug: reports success but doesn't delete) — verify this is still the case, and that the event is untouched, not partially corrupted | [ ] |
| 12 | Any event | `calendar_add_alarm` (each of display/sound/mail kinds) then `calendar_list_alarms` | All three kinds appear correctly; `calendar_remove_all_alarms` clears them | [ ] |
