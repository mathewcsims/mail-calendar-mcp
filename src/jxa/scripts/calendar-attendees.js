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
function findEventByUid(calendar, uid) {
  const matches = calendar.events.whose({ uid })();
  if (!matches.length) throw { code: "NOT_FOUND", message: `No event with uid ${uid} in this calendar` };
  return matches[0];
}

// Confirmed via testing: once any attendee is added to an event you organize, an extra
// entry with email=null and participationStatus "accepted" appears representing the
// organizer/self — not a bug, but worth flagging distinctly rather than silently hiding it.
function serializeAttendee(a) {
  return {
    email: tryProp(() => a.email()),
    displayName: tryProp(() => a.displayName()),
    participationStatus: tryProp(() => a.participationStatus()),
    isLikelyOrganizerSelf: tryProp(() => a.email()) == null,
  };
}

function run(argv) {
  const params = JSON.parse(argv[0] || "{}");
  const Cal = Application("Calendar");

  return runWithEnvelope(() => {
    switch (params.op) {
      case "list": {
        const cal = resolveCalendar(Cal, params);
        const ev = findEventByUid(cal, params.uid);
        return ev.attendees().map(serializeAttendee);
      }
      case "add": {
        const cal = resolveCalendar(Cal, params);
        const ev = findEventByUid(cal, params.uid);
        const before = ev.attendees().length;
        ev.attendees.push(Cal.Attendee({ email: params.email }));
        const after = ev.attendees();
        const added = after.some((a) => tryProp(() => a.email()) === params.email);
        if (after.length <= before || !added) {
          throw {
            code: "PLATFORM_LIMITATION",
            message:
              "Adding an attendee did not clearly take effect — this is a historically unreliable area of Calendar's AppleScript/JXA dictionary. Verify manually in Calendar.app.",
          };
        }
        return { added: true, attendees: after.map(serializeAttendee) };
      }
      case "remove": {
        const cal = resolveCalendar(Cal, params);
        const ev = findEventByUid(cal, params.uid);
        const target = ev.attendees().find((a) => tryProp(() => a.email()) === params.email);
        if (!target) {
          throw { code: "NOT_FOUND", message: `No attendee with email ${params.email} on this event` };
        }
        try {
          target.delete();
        } catch (e) {
          throw {
            code: "PLATFORM_LIMITATION",
            message: "Removing an attendee is unverified/unreliable via AppleScript/JXA on this system.",
            detail: String(e),
          };
        }
        const stillThere = ev.attendees().some((a) => tryProp(() => a.email()) === params.email);
        if (stillThere) {
          throw { code: "PLATFORM_LIMITATION", message: "Attendee removal reported success but the attendee still appears on re-read." };
        }
        return { removed: true };
      }
      default:
        throw { code: "INVALID_INPUT", message: `Unknown op: ${params.op}` };
    }
  });
}
