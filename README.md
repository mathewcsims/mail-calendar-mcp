# mail-calendar-mcp

A local MCP server giving full read/write control over Apple **Mail.app** and **Calendar.app** on macOS — every account configured in either app (iCloud, Google, Exchange, IMAP, etc.) is exposed uniformly, with no per-provider setup and no GUI/computer-use automation. All automation is done via JXA (`osascript -l JavaScript`) talking to the same AppleScript dictionaries Mail.app/Calendar.app themselves expose.

## Status

Feature-complete per the original build plan (`../.claude/plans/wise-swimming-gray.md`): all of Mail and Calendar's core scriptable surface is implemented, plus computed availability. Every tool below was exercised through the real MCP protocol against this machine's live Mail.app/Calendar.app during development, not just type-checked — several real bugs were found and fixed or explicitly documented as platform limitations in the process (see below).

## Tool inventory

### Mail

| Tool | Notes |
|---|---|
| `mail_list_accounts`, `mail_get_account`, `mail_get_account_stats` | Read-only |
| `mail_list_mailboxes`, `mail_create_mailbox` | Works reliably |
| `mail_rename_mailbox` | **Confirmed broken** — Mail rejects the property assignment. Rename manually in Mail.app. |
| `mail_delete_mailbox` | **Confirmed broken on cloud-synced accounts** (iCloud tested) — untested on a local "On My Mac" mailbox. `[IRREVERSIBLE]`, requires `confirm:true`. |
| `mail_search_messages`, `mail_get_message`, `mail_get_message_source`, `mail_get_message_headers`, `mail_list_attachments`, `mail_get_attachment` | Read-only, paginated (default 50/max 500) |
| `mail_set_read_status`, `mail_set_flagged`, `mail_set_flag_color`, `mail_move_message`, `mail_copy_message` | Works reliably |
| `mail_delete_message` | Moves to Trash, recoverable |
| `mail_permanently_delete_message` | `[IRREVERSIBLE]`, requires `confirm:true` |
| `mail_create_draft`, `mail_create_reply_draft`, `mail_create_forward_draft`, `mail_update_draft`, `mail_list_drafts`, `mail_delete_draft` | Requires `fromAddress` on new-compose calls — see gotcha below |
| `mail_add_attachment_to_draft` | **Unverified** — the JXA attachment-insertion syntax could not be live-tested; treat with suspicion |
| `mail_send_message` | `[IRREVERSIBLE]`, requires `confirm:true`. Two modes: send an existing `composeSessionId`, or compose+send fresh |
| `mail_list_signatures`, `mail_create_signature`, `mail_update_signature`, `mail_delete_signature` | Works reliably |
| `mail_list_rules` | Read-only by design — see permanent limitations below |

### Calendar

| Tool | Notes |
|---|---|
| `calendar_list_calendars` | Read-only. Returns an `index` for disambiguating duplicate calendar names (confirmed real on this machine: two calendars named "Calendar", two named "Birthdays") |
| `calendar_create_calendar`, `calendar_rename_calendar` | Works reliably |
| `calendar_delete_calendar` | **Confirmed broken** on at least some calendars — `[IRREVERSIBLE]`, requires `confirm:true`, expect `PLATFORM_LIMITATION` |
| `calendar_list_events`, `calendar_search_events` | Read-only. `startDate`/`endDate` are **required**, capped at 366 days — confirmed an unbounded query hangs indefinitely |
| `calendar_get_event` | By `uid` (the one calendar-related object that does have a stable id via scripting) |
| `calendar_create_event`, `calendar_update_event` | Verify-after-write; worked reliably in testing on this machine |
| `calendar_delete_event` | **Confirmed broken specifically for recurring events** — reports success but silently no-ops (reproduced twice). Detected via re-read, returns `PLATFORM_LIMITATION` rather than a false success. `[IRREVERSIBLE]`, requires `confirm:true` |
| `calendar_add_alarm`, `calendar_list_alarms`, `calendar_remove_all_alarms` | Works reliably (display/sound/mail kinds) |
| `calendar_list_attendees`, `calendar_add_attendee` | Worked reliably in testing (better than pessimistic community reports this was designed against). Adding an attendee surfaces an extra `email:null` self/organizer entry (`isLikelyOrganizerSelf:true`) — not a bug |
| `calendar_remove_attendee` | **Unverified** — implemented but not live-tested |
| `calendar_get_availability` | Computed locally (not a native Calendar.app feature) from busy intervals across the calendars you specify |

### Cross-cutting

| Tool | Notes |
|---|---|
| `mail_app_status`, `calendar_app_status` | Health-check — distinguishes "app not running" from a genuine data error |

## Setup

```bash
npm install
npm run build   # or `npm run dev` for a live tsx run during development
npm test        # runs the vitest suite (Node-side logic only, see Testing below)
```

Add to your MCP client config (Claude Desktop / Claude Code) pointing at `dist/index.js` (after `npm run build`) or `src/index.ts` via `npx tsx` for development.

### One-time macOS permission grant (Automation)

The first time the server actually calls into Mail.app or Calendar.app, macOS will show a system prompt: **"`<your terminal/host process>` wants to control `Mail`/`Calendar`."** You must click **OK**. This is a one-time grant per host-process identity, managed entirely by macOS — no code signing or entitlements needed for this path. If you ever deny it by mistake, re-enable it under:

**System Settings → Privacy & Security → Automation → (your terminal/Node host) → Mail / Calendar** (toggle on).

If a tool call ever fails with error code `AUTOMATION_NOT_AUTHORIZED`, this is the setting to check.

## Important gotcha: `fromAddress`

Creating a draft or sending without specifying `fromAddress` silently uses Mail.app's global default "send new messages from" account — confirmed during development that this is **not necessarily the account you intended** (on the development machine it defaulted to an unrelated work account rather than the personal account being targeted). `fromAddress` is a **required** field on `mail_create_draft` and on `mail_send_message` when composing fresh (not required when sending an existing `composeSessionId`, which already has an account fixed).

## Design notes

- **Injection-safe**: every JXA invocation uses `execFile('osascript', ['-l','JavaScript', <fixed script path>, <JSON string>])` — never a shell string, never AppleScript source built from caller input. See `src/jxa/runner.ts`.
- **Timeouts**: every call has a per-operation timeout with `SIGKILL` on expiry, since Mail/Calendar can hang against an offline/asleep account or an unbounded query. Verified against both a deliberately-hung script and a real unbounded Calendar query during development.
- **Error taxonomy**: see `src/errors.ts` — tool failures return one of a fixed set of codes (`APP_NOT_RUNNING`, `AUTOMATION_NOT_AUTHORIZED`, `ACCOUNT_OFFLINE_OR_ASLEEP`, `NOT_FOUND`, `TIMEOUT`, `PLATFORM_LIMITATION`, `INVALID_INPUT`, `UNEXPECTED_OSA_ERROR`) rather than opaque strings. `PLATFORM_LIMITATION` specifically covers writes that report success but don't actually take effect — caught by re-reading state after every mutating call.
- **Destructive-tool gating**: the highest-risk tools (permanent delete, send, delete calendar/mailbox) require an explicit `confirm: true` argument in addition to whatever gating your MCP client applies, as defense-in-depth against an accidental or hallucinated call. See `requireConfirm()` in `src/tools/register.ts`.
- **Object identity**: Mail messages are addressed by `{accountName, mailboxPath, messageId}` (Mail's internal numeric id) or by RFC822 Message-ID; mailboxes by hierarchical name path; Calendar events by their iCalendar `uid` (stable via scripting, unlike calendars themselves, which have no queryable uid — hence the `calendarIndex` disambiguator).
- **Native Swift/EventKit helper**: considered as a Phase 3 stretch goal for Calendar reliability, but **not built** — event/calendar creation, updates, and attendee-add all worked reliably via JXA in live testing on this machine, better than the pessimistic community reports (Calendar AppleScript scripting has visibly regressed on some recent macOS releases per public reports) the plan was hedging against. Revisit only if a specific operation proves unreliable in practice.

## Known permanent platform limitations

(Not bugs — confirmed not achievable via AppleScript/JXA, and in most cases no alternative API exists either.)

- **Mail**: creating/editing Mail rules (rules can only invoke a script as an *action*, not be created externally — `mail_list_rules` is read-only by design); mail account creation/credential management.
- **Calendar**: sending or RSVP-replying to meeting invitations; to-dos (moved entirely to Reminders.app, a separate app/dictionary, out of scope here).

## Known confirmed-broken/flaky operations

(Found via live testing, not guessed — reproduced deterministically before being documented.)

- `mail_rename_mailbox` — the property assignment is rejected outright.
- `mail_delete_mailbox` — fails on cloud-synced accounts (confirmed on iCloud); untested on local mailboxes.
- `mail_add_attachment_to_draft` — syntax unverified, no live test possible; treat with suspicion.
- `calendar_delete_calendar` — fails on at least some calendars.
- `calendar_delete_event` on a **recurring** event — reports success without actually deleting. This is the most important one: it's silently wrong unless caught, which is why every mutating Calendar tool verifies its result before reporting success.
- `calendar_remove_attendee` — implemented but not live-tested; treat with suspicion until verified.

## Testing

There's no way to unit-test "did this actually change Mail.app/Calendar.app state" outside a live session, so verification is two-tiered:

1. **Manual checklists** (`test/manual-checklists/`) — the primary verification method, run against dedicated scratch fixtures so destructive-op testing never touches real mail/events:
   - Mail: a `Testing/MCP-Scratch` mailbox on a non-work account, all send-tests target only your own address.
   - Calendar: a local `MCP-Scratch` calendar ("On My Mac", to avoid sync churn).
   - Two leftover artifacts from development remain and need manual cleanup since scripting can't remove them (see the confirmed-broken list above): an empty `MCP-Delete-Test` mailbox in iCloud Mail, and two undeletable recurring test events in the `MCP-Scratch` calendar.
2. **`npm test`** (vitest) — covers only the Node-side logic that doesn't need live app state: error-code mapping (`test/errors.test.ts`), destructive-tool confirm-gating (`test/register.test.ts`), JSON envelope parsing robustness (`test/jxa-runner.test.ts`), and free/busy gap computation (`test/availability.test.ts`).
