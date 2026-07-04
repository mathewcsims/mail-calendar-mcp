# Calendar: attendees & availability

| # | Precondition | Tool call | Expected result | Pass/Fail |
|---|---|---|---|---|
| 1 | Event on MCP-Scratch | `calendar_add_attendee` with your own email | Attendee appears in Calendar.app's event detail; `calendar_list_attendees` shows it plus the extra organizer/self entry (`isLikelyOrganizerSelf:true`) | [ ] |
| 2 | Event with an attendee from #1 | `calendar_remove_attendee` | Attendee gone from both Calendar.app and `calendar_list_attendees` — this path is unverified, confirm actual behavior and update README | [ ] |
| 3 | A **real** event you organize with a real external attendee (use with caution — this is a genuine invitation) | `calendar_add_attendee` | Confirm whether Calendar actually sends an invitation email, or just adds the attendee locally without notifying them (README currently assumes no native "send invite" capability — verify this assumption) | [ ] |
| 4 | Two calendars each with events in the same week | `calendar_get_availability` across both | `busy` intervals match both calendars' real events; `free` gaps correctly avoid all busy time, including where events overlap across the two calendars | [ ] |
| 5 | — | `calendar_get_availability` with a >366 day range | Rejected with `INVALID_INPUT` (same cap as `calendar_list_events`) | [ ] |
