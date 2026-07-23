// calendar-helper: native EventKit backend for mail-calendar-mcp.
//
// Same contract as the JXA scripts: one JSON argument in argv[1], one JSON
// envelope ({ok:true,data} | {ok:false,error:{code,message}}) on stdout.
//
// Exists because Calendar.app's AppleScript bridge silently no-ops on several
// operations (recurring-event delete, calendar delete). EventKit is the
// underlying real API and additionally exposes per-occurrence vs whole-series
// semantics (EKSpan) that AppleScript cannot express at all.

import EventKit
import Foundation

struct HelperError: Error {
    let code: String
    let message: String
}

// MARK: - JSON plumbing

func emit(_ object: [String: Any]) -> Never {
    let data = try! JSONSerialization.data(withJSONObject: object, options: [])
    print(String(data: data, encoding: .utf8)!)
    exit(0)
}

func succeed(_ data: Any) -> Never {
    emit(["ok": true, "data": data])
}

func failOut(_ code: String, _ message: String) -> Never {
    emit(["ok": false, "error": ["code": code, "message": message]])
}

// MARK: - Dates

let isoOut: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

func parseDate(_ s: String) throws -> Date {
    let isoIn = ISO8601DateFormatter()
    isoIn.formatOptions = [.withInternetDateTime]
    if let d = isoIn.date(from: s) { return d }
    isoIn.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = isoIn.date(from: s) { return d }
    // No timezone suffix: interpret in the machine's local zone, matching how
    // the JXA backend treated bare "2026-08-15T10:00:00" strings.
    let local = DateFormatter()
    local.locale = Locale(identifier: "en_US_POSIX")
    local.timeZone = TimeZone.current
    for fmt in ["yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd"] {
        local.dateFormat = fmt
        if let d = local.date(from: s) { return d }
    }
    throw HelperError(code: "INVALID_INPUT", message: "Unparseable date: \(s)")
}

// MARK: - Access

let store = EKEventStore()

func ensureAccess() throws {
    let status = EKEventStore.authorizationStatus(for: .event)
    if #available(macOS 14.0, *), status == .fullAccess { return }
    if status == .authorized { return }
    // Attempt the full-access request from every non-granted state, not just
    // .notDetermined: macOS can hand out write-only access (status 4) without
    // ever prompting, and the upgrade path to full access is this same call.
    // If access is permanently denied the call returns false immediately —
    // harmless.
    let sema = DispatchSemaphore(value: 0)
    var granted = false
    var reqError: Error?
    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { g, e in
            granted = g
            reqError = e
            sema.signal()
        }
    } else {
        store.requestAccess(to: .event) { g, e in
            granted = g
            reqError = e
            sema.signal()
        }
    }
    sema.wait()
    if granted { return }
    let detail = reqError.map { " (\($0.localizedDescription))" } ?? ""
    throw HelperError(
        code: "AUTOMATION_NOT_AUTHORIZED",
        message: "Calendar access was not granted (status \(status.rawValue))\(detail). Approve the macOS prompt if one appeared, or set this helper to \"Full Access\" under System Settings > Privacy & Security > Calendars."
    )
}

// MARK: - Lookup helpers

func findCalendar(_ params: [String: Any]) throws -> EKCalendar {
    let calendars = store.calendars(for: .event)
    if let id = params["calendarId"] as? String {
        if let cal = calendars.first(where: { $0.calendarIdentifier == id }) { return cal }
        throw HelperError(code: "NOT_FOUND", message: "No calendar with id \(id)")
    }
    if let name = params["calendarName"] as? String {
        let matches = calendars.filter { $0.title == name }
        if matches.isEmpty { throw HelperError(code: "NOT_FOUND", message: "No calendar named \(name)") }
        if matches.count > 1 {
            throw HelperError(
                code: "INVALID_INPUT",
                message: "Multiple calendars named \(name) — use calendarId (from calendar_list_calendars) to disambiguate."
            )
        }
        return matches[0]
    }
    throw HelperError(code: "INVALID_INPUT", message: "Provide calendarName or calendarId")
}

/// Resolve an event by iCalendar UID (external identifier — the same `uid` the
/// JXA backend exposes, so tool-level identity is backend-independent).
/// With occurrenceDate: the specific occurrence of a recurring event.
/// Without: the master/first event.
func findEvent(uid: String, occurrenceDate: String?, calendar: EKCalendar?) throws -> EKEvent {
    let items = store.calendarItems(withExternalIdentifier: uid).compactMap { $0 as? EKEvent }
    let scoped = calendar == nil ? items : items.filter { $0.calendar.calendarIdentifier == calendar!.calendarIdentifier }
    guard let master = scoped.first else {
        throw HelperError(code: "NOT_FOUND", message: "No event with uid \(uid)")
    }
    guard let occStr = occurrenceDate else { return master }

    let target = try parseDate(occStr)
    let windowStart = target.addingTimeInterval(-86400)
    let windowEnd = target.addingTimeInterval(86400)
    let predicate = store.predicateForEvents(withStart: windowStart, end: windowEnd, calendars: calendar.map { [$0] })
    let occurrences = store.events(matching: predicate).filter { $0.calendarItemExternalIdentifier == uid }
    guard let match = occurrences.min(by: {
        abs($0.startDate.timeIntervalSince(target)) < abs($1.startDate.timeIntervalSince(target))
    }), abs(match.startDate.timeIntervalSince(target)) < 86400 else {
        throw HelperError(code: "NOT_FOUND", message: "No occurrence of event \(uid) near \(occStr)")
    }
    return match
}

func spanFrom(_ params: [String: Any], isRecurring: Bool) -> EKSpan {
    guard isRecurring else { return .thisEvent }
    switch params["span"] as? String {
    case "this": return .thisEvent
    case "future": return .futureEvents
    default:
        // Whole-series operations target the master event with .futureEvents;
        // per-occurrence calls pass occurrenceDate + span explicitly.
        return params["occurrenceDate"] != nil ? .thisEvent : .futureEvents
    }
}

// MARK: - RRULE (subset) <-> EKRecurrenceRule

let weekdayMap: [String: EKWeekday] = [
    "SU": .sunday, "MO": .monday, "TU": .tuesday, "WE": .wednesday,
    "TH": .thursday, "FR": .friday, "SA": .saturday,
]

func parseRrule(_ text: String) throws -> EKRecurrenceRule {
    var freq: EKRecurrenceFrequency?
    var interval = 1
    var count: Int?
    var until: Date?
    var days: [EKRecurrenceDayOfWeek]?

    for part in text.uppercased().split(separator: ";") {
        let kv = part.split(separator: "=", maxSplits: 1)
        guard kv.count == 2 else { continue }
        let key = String(kv[0])
        let value = String(kv[1])
        switch key {
        case "FREQ":
            switch value {
            case "DAILY": freq = .daily
            case "WEEKLY": freq = .weekly
            case "MONTHLY": freq = .monthly
            case "YEARLY": freq = .yearly
            default: throw HelperError(code: "INVALID_INPUT", message: "Unsupported FREQ: \(value)")
            }
        case "INTERVAL":
            interval = Int(value) ?? 1
        case "COUNT":
            count = Int(value)
        case "UNTIL":
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.timeZone = TimeZone(identifier: "UTC")
            f.dateFormat = value.contains("T") ? "yyyyMMdd'T'HHmmss'Z'" : "yyyyMMdd"
            guard let d = f.date(from: value) else {
                throw HelperError(code: "INVALID_INPUT", message: "Unparseable UNTIL: \(value)")
            }
            until = d
        case "BYDAY":
            days = try value.split(separator: ",").map { token in
                guard let wd = weekdayMap[String(token)] else {
                    throw HelperError(code: "INVALID_INPUT", message: "Unsupported BYDAY token: \(token) (plain weekdays only)")
                }
                return EKRecurrenceDayOfWeek(wd)
            }
        default:
            throw HelperError(code: "INVALID_INPUT", message: "Unsupported RRULE key: \(key) (supported: FREQ, INTERVAL, COUNT, UNTIL, BYDAY)")
        }
    }
    guard let frequency = freq else {
        throw HelperError(code: "INVALID_INPUT", message: "RRULE must include FREQ")
    }
    var end: EKRecurrenceEnd?
    if let c = count { end = EKRecurrenceEnd(occurrenceCount: c) }
    if let u = until { end = EKRecurrenceEnd(end: u) }
    return EKRecurrenceRule(
        recurrenceWith: frequency, interval: interval,
        daysOfTheWeek: days, daysOfTheMonth: nil, monthsOfTheYear: nil,
        weeksOfTheYear: nil, daysOfTheYear: nil, setPositions: nil, end: end
    )
}

func rruleText(_ rule: EKRecurrenceRule) -> String {
    var parts: [String] = []
    switch rule.frequency {
    case .daily: parts.append("FREQ=DAILY")
    case .weekly: parts.append("FREQ=WEEKLY")
    case .monthly: parts.append("FREQ=MONTHLY")
    case .yearly: parts.append("FREQ=YEARLY")
    @unknown default: parts.append("FREQ=UNKNOWN")
    }
    if rule.interval != 1 { parts.append("INTERVAL=\(rule.interval)") }
    if let end = rule.recurrenceEnd {
        if end.occurrenceCount > 0 {
            parts.append("COUNT=\(end.occurrenceCount)")
        } else if let d = end.endDate {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.timeZone = TimeZone(identifier: "UTC")
            f.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
            parts.append("UNTIL=\(f.string(from: d))")
        }
    }
    if let days = rule.daysOfTheWeek, !days.isEmpty {
        let tokens = days.map { day -> String in
            for (token, wd) in weekdayMap where wd == day.dayOfTheWeek { return token }
            return "??"
        }
        parts.append("BYDAY=\(tokens.joined(separator: ","))")
    }
    return parts.joined(separator: ";")
}

// MARK: - Serialization

func serializeCalendar(_ cal: EKCalendar) -> [String: Any] {
    return [
        "calendarId": cal.calendarIdentifier,
        "name": cal.title,
        "source": cal.source?.title ?? NSNull() as Any,
        "writable": cal.allowsContentModifications,
        "type": String(describing: cal.type),
    ]
}

func serializeEvent(_ e: EKEvent) -> [String: Any] {
    var out: [String: Any] = [
        "uid": e.calendarItemExternalIdentifier ?? NSNull() as Any,
        "summary": e.title ?? NSNull() as Any,
        "location": e.location ?? NSNull() as Any,
        "description": e.notes ?? NSNull() as Any,
        "startDate": e.startDate.map { isoOut.string(from: $0) } ?? NSNull() as Any,
        "endDate": e.endDate.map { isoOut.string(from: $0) } ?? NSNull() as Any,
        "alldayEvent": e.isAllDay,
        "calendarName": e.calendar?.title ?? NSNull() as Any,
        "calendarId": e.calendar?.calendarIdentifier ?? NSNull() as Any,
        "isRecurring": e.hasRecurrenceRules,
        "isDetachedOccurrence": e.isDetached,
        "recurrence": (e.recurrenceRules?.first).map { rruleText($0) } ?? NSNull() as Any,
        "status": String(describing: e.status),
    ]
    if let attendees = e.attendees {
        out["attendees"] = attendees.map { p -> [String: Any] in
            [
                "name": p.name ?? NSNull() as Any,
                "email": p.url.absoluteString.replacingOccurrences(of: "mailto:", with: ""),
                "participationStatus": String(describing: p.participantStatus),
                "isCurrentUser": p.isCurrentUser,
            ]
        }
    }
    if let alarms = e.alarms {
        out["alarms"] = alarms.map { ["minutesBefore": Int(-$0.relativeOffset / 60)] }
    }
    return out
}

// MARK: - Ops

func applyEventFields(_ event: EKEvent, _ params: [String: Any]) throws {
    if let v = params["summary"] as? String { event.title = v }
    if let v = params["location"] as? String { event.location = v }
    if let v = params["description"] as? String { event.notes = v }
    if let v = params["startDate"] as? String { event.startDate = try parseDate(v) }
    if let v = params["endDate"] as? String { event.endDate = try parseDate(v) }
    if let v = params["alldayEvent"] as? Bool { event.isAllDay = v }
    if let v = params["recurrence"] as? String {
        event.recurrenceRules = v.isEmpty ? nil : [try parseRrule(v)]
    }
    if let mins = params["alarmMinutesBefore"] as? [Int] {
        event.alarms = mins.map { EKAlarm(relativeOffset: TimeInterval(-$0 * 60)) }
    }
}

func run(_ params: [String: Any]) throws -> Any {
    guard let op = params["op"] as? String else {
        throw HelperError(code: "INVALID_INPUT", message: "Missing op")
    }

    // status intentionally skips ensureAccess so it can report the auth state itself.
    if op == "status" {
        let status = EKEventStore.authorizationStatus(for: .event)
        let authorized: Bool
        if #available(macOS 14.0, *) {
            authorized = status == .fullAccess
        } else {
            authorized = status == .authorized
        }
        return [
            "backend": "eventkit",
            "authorized": authorized,
            "authorizationStatus": status.rawValue,
            "calendarCount": authorized ? store.calendars(for: .event).count : NSNull() as Any,
        ]
    }
    if op == "requestAccess" {
        try ensureAccess()
        return ["authorized": true, "calendarCount": store.calendars(for: .event).count]
    }

    try ensureAccess()

    switch op {
    case "listCalendars":
        return store.calendars(for: .event).map(serializeCalendar)

    case "createCalendar":
        guard let name = params["name"] as? String else {
            throw HelperError(code: "INVALID_INPUT", message: "Missing name")
        }
        let cal = EKCalendar(for: .event, eventStore: store)
        cal.title = name
        if let sourceName = params["sourceName"] as? String {
            guard let source = store.sources.first(where: { $0.title == sourceName }) else {
                let available = store.sources.map { $0.title }.joined(separator: ", ")
                throw HelperError(code: "NOT_FOUND", message: "No source named \(sourceName). Available: \(available)")
            }
            cal.source = source
        } else if let defaultSource = store.defaultCalendarForNewEvents?.source {
            cal.source = defaultSource
        } else {
            throw HelperError(code: "PLATFORM_LIMITATION", message: "No default calendar source — pass sourceName explicitly.")
        }
        try store.saveCalendar(cal, commit: true)
        return serializeCalendar(cal)

    case "renameCalendar":
        let cal = try findCalendar(params)
        guard let newName = params["newName"] as? String else {
            throw HelperError(code: "INVALID_INPUT", message: "Missing newName")
        }
        cal.title = newName
        try store.saveCalendar(cal, commit: true)
        return serializeCalendar(cal)

    case "deleteCalendar":
        let cal = try findCalendar(params)
        let id = cal.calendarIdentifier
        try store.removeCalendar(cal, commit: true)
        if store.calendars(for: .event).contains(where: { $0.calendarIdentifier == id }) {
            throw HelperError(code: "PLATFORM_LIMITATION", message: "Calendar still exists after removal.")
        }
        return ["deleted": true]

    case "listSources":
        return store.sources.map { ["name": $0.title, "type": String(describing: $0.sourceType)] }

    case "listEvents":
        guard let startStr = params["startDate"] as? String, let endStr = params["endDate"] as? String else {
            throw HelperError(code: "INVALID_INPUT", message: "startDate and endDate are required")
        }
        let start = try parseDate(startStr)
        let end = try parseDate(endStr)
        if end.timeIntervalSince(start) > 366 * 86400 {
            throw HelperError(code: "INVALID_INPUT", message: "Date range exceeds the 366-day cap — narrow it.")
        }
        var calendars: [EKCalendar]?
        if params["calendarName"] != nil || params["calendarId"] != nil {
            calendars = [try findCalendar(params)]
        } else if let locators = params["calendars"] as? [[String: Any]] {
            calendars = try locators.map { try findCalendar($0) }
        }
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
        var events = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }
        if let text = params["textContains"] as? String, !text.isEmpty {
            events = events.filter { ($0.title ?? "").localizedCaseInsensitiveContains(text) }
        }
        let total = events.count
        let offset = params["offset"] as? Int ?? 0
        let limit = min(params["limit"] as? Int ?? 100, 1000)
        let page = events.dropFirst(offset).prefix(limit)
        return [
            "total": total, "offset": offset, "limit": limit,
            "hasMore": offset + limit < total,
            "events": page.map(serializeEvent),
        ]

    case "getEvent":
        guard let uid = params["uid"] as? String else {
            throw HelperError(code: "INVALID_INPUT", message: "Missing uid")
        }
        let cal = (params["calendarName"] != nil || params["calendarId"] != nil) ? try findCalendar(params) : nil
        let event = try findEvent(uid: uid, occurrenceDate: params["occurrenceDate"] as? String, calendar: cal)
        return serializeEvent(event)

    case "createEvent":
        let cal = try findCalendar(params)
        guard params["startDate"] is String, params["endDate"] is String else {
            throw HelperError(code: "INVALID_INPUT", message: "startDate and endDate are required")
        }
        let event = EKEvent(eventStore: store)
        event.calendar = cal
        try applyEventFields(event, params)
        try store.save(event, span: .thisEvent, commit: true)
        return serializeEvent(event)

    case "updateEvent":
        guard let uid = params["uid"] as? String else {
            throw HelperError(code: "INVALID_INPUT", message: "Missing uid")
        }
        let cal = (params["calendarName"] != nil || params["calendarId"] != nil) ? try findCalendar(params) : nil
        let event = try findEvent(uid: uid, occurrenceDate: params["occurrenceDate"] as? String, calendar: cal)
        let span = spanFrom(params, isRecurring: event.hasRecurrenceRules || event.isDetached)
        try applyEventFields(event, params)
        try store.save(event, span: span, commit: true)
        return serializeEvent(event)

    case "deleteEvent":
        guard let uid = params["uid"] as? String else {
            throw HelperError(code: "INVALID_INPUT", message: "Missing uid")
        }
        let cal = (params["calendarName"] != nil || params["calendarId"] != nil) ? try findCalendar(params) : nil
        let event = try findEvent(uid: uid, occurrenceDate: params["occurrenceDate"] as? String, calendar: cal)
        let wholeSeries = (event.hasRecurrenceRules || event.isDetached) && params["occurrenceDate"] == nil
        let span = spanFrom(params, isRecurring: event.hasRecurrenceRules || event.isDetached)
        try store.remove(event, span: span, commit: true)
        if wholeSeries {
            let remaining = store.calendarItems(withExternalIdentifier: uid).compactMap { $0 as? EKEvent }
            if !remaining.isEmpty {
                throw HelperError(code: "PLATFORM_LIMITATION", message: "Series still exists after removal.")
            }
        }
        return ["deleted": true, "span": span == .thisEvent ? "this" : "future"]

    default:
        throw HelperError(code: "INVALID_INPUT", message: "Unknown op: \(op)")
    }
}

// MARK: - Entry

let args = CommandLine.arguments
guard args.count >= 2, let argData = args[1].data(using: .utf8),
      let parsed = try? JSONSerialization.jsonObject(with: argData) as? [String: Any]
else {
    failOut("INVALID_INPUT", "Expected a single JSON argument")
}

do {
    let result = try run(parsed)
    succeed(result)
} catch let err as HelperError {
    failOut(err.code, err.message)
} catch {
    failOut("UNEXPECTED_OSA_ERROR", "EventKit error: \(error.localizedDescription)")
}
