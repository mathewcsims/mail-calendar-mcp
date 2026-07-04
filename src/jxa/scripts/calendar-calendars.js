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

// Calendar objects have no queryable uid via scripting (confirmed via testing — `.uid()`
// on a calendar throws). Duplicate calendar names are common on multi-account setups
// (confirmed on this machine: two calendars named "Calendar", two named "Birthdays"), so
// callers disambiguate with `calendarIndex` (position in Cal.calendars(), stable for the
// current Calendar.app process) when `calendarName` alone is ambiguous.
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

function serializeCalendar(c, index) {
  return {
    index,
    name: tryProp(() => c.name()),
    writable: tryProp(() => c.writable()),
    description: tryProp(() => c.description()),
  };
}

function run(argv) {
  const params = JSON.parse(argv[0] || "{}");
  const Cal = Application("Calendar");

  return runWithEnvelope(() => {
    switch (params.op) {
      case "list": {
        return Cal.calendars().map(serializeCalendar);
      }
      case "create": {
        const cal = Cal.make({ new: "calendar", withProperties: { name: params.name } });
        // Verify-after-write: Calendar create/update/delete are known-flaky on this
        // platform (confirmed via testing — e.g. deleting a recurring event silently
        // no-ops), so every mutating calendar/event op re-reads state before reporting
        // success rather than trusting the absence of a thrown error.
        const found = Cal.calendars().some((c) => tryProp(() => c.name()) === params.name);
        if (!found) {
          throw { code: "PLATFORM_LIMITATION", message: "Calendar creation did not take effect (not found on re-read)." };
        }
        return { created: true, name: cal.name() };
      }
      case "rename": {
        const cal = resolveCalendar(Cal, params);
        cal.name = params.newName;
        const renamed = cal.name() === params.newName;
        if (!renamed) {
          throw { code: "PLATFORM_LIMITATION", message: "Calendar rename did not take effect." };
        }
        return { renamed: true, newName: cal.name() };
      }
      case "delete": {
        const cal = resolveCalendar(Cal, params);
        const name = tryProp(() => cal.name());
        try {
          cal.delete();
        } catch (e) {
          throw {
            code: "PLATFORM_LIMITATION",
            message:
              "Calendar refused to delete this calendar via scripting (confirmed via testing — a known limitation, not specific to this calendar). Delete it manually in Calendar.app instead.",
            detail: String(e),
          };
        }
        const stillThere = Cal.calendars().some((c) => tryProp(() => c.name()) === name);
        if (stillThere) {
          throw {
            code: "PLATFORM_LIMITATION",
            message: "Calendar delete reported success but the calendar still exists on re-read. Delete it manually in Calendar.app instead.",
          };
        }
        return { deleted: true };
      }
      default:
        throw { code: "INVALID_INPUT", message: `Unknown op: ${params.op}` };
    }
  });
}
