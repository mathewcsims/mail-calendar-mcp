function ok(data) {
  return JSON.stringify({ ok: true, data });
}
function fail(code, message, detail) {
  return JSON.stringify({ ok: false, error: { code, message, detail } });
}
function tryProp(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    return fallback === undefined ? null : fallback;
  }
}
function runWithEnvelope(fn) {
  try {
    return ok(fn());
  } catch (e) {
    if (e && e.code) return fail(e.code, e.message, e.detail);
    return fail("UNEXPECTED_OSA_ERROR", String(e));
  }
}
function resolveCalendar(Cal, params) {
  const all = Cal.calendars();
  if (params.calendarIndex != null) {
    const cal = all[params.calendarIndex];
    if (!cal) throw { code: "NOT_FOUND", message: `No calendar at index ${params.calendarIndex}` };
    return cal;
  }
  const cal = all.find((c) => tryProp(() => c.name()) === params.calendarName);
  if (!cal) throw { code: "NOT_FOUND", message: `No such calendar: ${params.calendarName}` };
  return cal;
}

const MAX_RANGE_DAYS = 366;

function assertBoundedRange(startIso, endIso) {
  if (!startIso || !endIso) {
    throw { code: "INVALID_INPUT", message: "startDate and endDate are required." };
  }
  const start = new Date(startIso);
  const end = new Date(endIso);
  const days = (end.getTime() - start.getTime()) / 86400000;
  if (days < 0) throw { code: "INVALID_INPUT", message: "endDate must be after startDate." };
  if (days > MAX_RANGE_DAYS) {
    throw {
      code: "INVALID_INPUT",
      message: `Date range spans ${Math.round(days)} days, exceeding the ${MAX_RANGE_DAYS}-day cap. This limit exists because unbounded/very wide calendar queries have been observed to hang indefinitely (confirmed via testing) — narrow the range.`,
    };
  }
  return { start, end };
}

function serializeEvent(e) {
  return {
    uid: tryProp(() => e.uid()),
    summary: tryProp(() => e.summary()),
    location: tryProp(() => e.location()),
    description: tryProp(() => e.description()),
    startDate: tryProp(() => String(e.startDate())),
    endDate: tryProp(() => String(e.endDate())),
    alldayEvent: tryProp(() => e.alldayEvent()),
    recurrence: tryProp(() => e.recurrence()),
  };
}

function findEventByUid(calendar, uid) {
  const matches = calendar.events.whose({ uid })();
  if (!matches.length) throw { code: "NOT_FOUND", message: `No event with uid ${uid} in this calendar` };
  return matches[0];
}

function applyEventProps(Cal, ev, params) {
  if (params.summary !== undefined) ev.summary = params.summary;
  if (params.location !== undefined) ev.location = params.location;
  if (params.description !== undefined) ev.description = params.description;
  if (params.startDate !== undefined) ev.startDate = new Date(params.startDate);
  if (params.endDate !== undefined) ev.endDate = new Date(params.endDate);
  if (params.alldayEvent !== undefined) ev.alldayEvent = params.alldayEvent;
  if (params.recurrence !== undefined) ev.recurrence = params.recurrence;
}

function run(argv) {
  const params = JSON.parse(argv[0] || "{}");
  const Cal = Application("Calendar");

  return runWithEnvelope(() => {
    switch (params.op) {
      case "list": {
        const { start, end } = assertBoundedRange(params.startDate, params.endDate);
        const cal = resolveCalendar(Cal, params);
        const evs = cal.events.whose({ _and: [{ startDate: { _greaterThan: start } }, { startDate: { _lessThan: end } }] })();
        const limit = Math.min(params.limit || 100, 1000);
        const offset = params.offset || 0;
        const page = evs.slice(offset, offset + limit);
        return { total: evs.length, offset, limit, hasMore: offset + limit < evs.length, events: page.map(serializeEvent) };
      }
      case "search": {
        const { start, end } = assertBoundedRange(params.startDate, params.endDate);
        const cal = resolveCalendar(Cal, params);
        const clause = { _and: [{ startDate: { _greaterThan: start } }, { startDate: { _lessThan: end } }] };
        if (params.textContains) clause._and.push({ summary: { _contains: params.textContains } });
        const evs = cal.events.whose(clause)();
        return { total: evs.length, events: evs.map(serializeEvent) };
      }
      case "get": {
        const cal = resolveCalendar(Cal, params);
        const ev = findEventByUid(cal, params.uid);
        return serializeEvent(ev);
      }
      case "create": {
        const cal = resolveCalendar(Cal, params);
        const props = {
          summary: params.summary || "",
          startDate: new Date(params.startDate),
          endDate: new Date(params.endDate),
        };
        if (params.location) props.location = params.location;
        if (params.description) props.description = params.description;
        if (params.alldayEvent) props.alldayEvent = params.alldayEvent;
        if (params.recurrence) props.recurrence = params.recurrence;
        const ev = Cal.make({ new: "event", withProperties: props, at: cal });
        const uid = ev.uid();
        // Verify-after-write (see calendar-calendars.js for rationale).
        const check = cal.events.whose({ uid })();
        if (!check.length) {
          throw { code: "PLATFORM_LIMITATION", message: "Event creation did not take effect (not found on re-read by uid)." };
        }
        return serializeEvent(check[0]);
      }
      case "update": {
        const cal = resolveCalendar(Cal, params);
        const ev = findEventByUid(cal, params.uid);
        applyEventProps(Cal, ev, params);
        const check = findEventByUid(cal, params.uid);
        const mismatches = [];
        if (params.summary !== undefined && check.summary() !== params.summary) mismatches.push("summary");
        if (params.location !== undefined && check.location() !== params.location) mismatches.push("location");
        if (params.recurrence !== undefined && check.recurrence() !== params.recurrence) mismatches.push("recurrence");
        if (mismatches.length) {
          throw {
            code: "PLATFORM_LIMITATION",
            message: `Update reported success but these fields did not take effect on re-read: ${mismatches.join(", ")}. This has been observed for recurrence changes on existing recurring events on this platform.`,
          };
        }
        return serializeEvent(check);
      }
      case "delete": {
        const cal = resolveCalendar(Cal, params);
        const ev = findEventByUid(cal, params.uid);
        const wasRecurring = !!tryProp(() => ev.recurrence());
        ev.delete();
        const stillThere = cal.events.whose({ uid: params.uid })().length > 0;
        if (stillThere) {
          throw {
            code: "PLATFORM_LIMITATION",
            message: wasRecurring
              ? "Delete reported success but the event still exists on re-read. Confirmed via testing: deleting a recurring event via AppleScript/JXA silently no-ops on this platform — delete it manually in Calendar.app, where you can choose 'this event' vs 'all future events'."
              : "Delete reported success but the event still exists on re-read.",
          };
        }
        return { deleted: true };
      }
      case "addAlarm": {
        const cal = resolveCalendar(Cal, params);
        const ev = findEventByUid(cal, params.uid);
        const kind = params.kind || "display"; // "display" | "sound" | "mail"
        const countBefore =
          kind === "sound" ? ev.soundAlarms().length : kind === "mail" ? ev.mailAlarms().length : ev.displayAlarms().length;
        if (kind === "sound") ev.soundAlarms.push(Cal.SoundAlarm({ triggerInterval: params.minutesBefore * -1 }));
        else if (kind === "mail") ev.mailAlarms.push(Cal.MailAlarm({ triggerInterval: params.minutesBefore * -1 }));
        else ev.displayAlarms.push(Cal.DisplayAlarm({ triggerInterval: params.minutesBefore * -1 }));
        const countAfter =
          kind === "sound" ? ev.soundAlarms().length : kind === "mail" ? ev.mailAlarms().length : ev.displayAlarms().length;
        if (countAfter <= countBefore) {
          throw { code: "PLATFORM_LIMITATION", message: "Alarm add did not take effect (count unchanged on re-read)." };
        }
        return { added: true, kind, count: countAfter };
      }
      case "listAlarms": {
        const cal = resolveCalendar(Cal, params);
        const ev = findEventByUid(cal, params.uid);
        return {
          display: ev.displayAlarms().map((a) => ({ triggerInterval: tryProp(() => a.triggerInterval()) })),
          sound: ev.soundAlarms().map((a) => ({ triggerInterval: tryProp(() => a.triggerInterval()) })),
          mail: ev.mailAlarms().map((a) => ({ triggerInterval: tryProp(() => a.triggerInterval()) })),
        };
      }
      case "listBusyIntervals": {
        // Used by the computed (non-native) availability tool: pulls raw start/end pairs
        // across several calendars in one osascript call rather than one round trip per
        // calendar. Free/busy gap computation itself happens on the Node side.
        const { start, end } = assertBoundedRange(params.startDate, params.endDate);
        const locators = params.calendars || [];
        const intervals = [];
        for (const loc of locators) {
          const cal = resolveCalendar(Cal, loc);
          const evs = cal.events.whose({ _and: [{ startDate: { _greaterThan: start } }, { startDate: { _lessThan: end } }] })();
          for (const e of evs) {
            intervals.push({
              calendarName: tryProp(() => cal.name()),
              summary: tryProp(() => e.summary()),
              startDate: tryProp(() => String(e.startDate())),
              endDate: tryProp(() => String(e.endDate())),
            });
          }
        }
        return { intervals };
      }
      case "removeAllAlarms": {
        const cal = resolveCalendar(Cal, params);
        const ev = findEventByUid(cal, params.uid);
        ev.displayAlarms().forEach((a) => a.delete());
        ev.soundAlarms().forEach((a) => a.delete());
        ev.mailAlarms().forEach((a) => a.delete());
        return { removed: true };
      }
      default:
        throw { code: "INVALID_INPUT", message: `Unknown op: ${params.op}` };
    }
  });
}
