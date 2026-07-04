import { describe, it, expect } from "vitest";
import { computeFreeGaps, type BusyInterval } from "../src/tools/calendar/availability.js";

const iso = (s: string) => new Date(s);

function interval(start: string, end: string): BusyInterval {
  return { calendarName: "test", summary: "test", startDate: start, endDate: end };
}

describe("computeFreeGaps", () => {
  it("returns the whole range as free when there are no busy intervals", () => {
    const gaps = computeFreeGaps([], iso("2026-01-01T00:00:00Z"), iso("2026-01-02T00:00:00Z"));
    expect(gaps).toEqual([{ start: "2026-01-01T00:00:00.000Z", end: "2026-01-02T00:00:00.000Z" }]);
  });

  it("splits around a single busy interval in the middle of the range", () => {
    const gaps = computeFreeGaps(
      [interval("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z")],
      iso("2026-01-01T00:00:00Z"),
      iso("2026-01-01T23:00:00Z")
    );
    expect(gaps).toEqual([
      { start: "2026-01-01T00:00:00.000Z", end: "2026-01-01T10:00:00.000Z" },
      { start: "2026-01-01T11:00:00.000Z", end: "2026-01-01T23:00:00.000Z" },
    ]);
  });

  it("produces no gaps when a single busy interval covers the entire range", () => {
    const gaps = computeFreeGaps(
      [interval("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")],
      iso("2026-01-01T00:00:00Z"),
      iso("2026-01-02T00:00:00Z")
    );
    expect(gaps).toEqual([]);
  });

  it("merges overlapping busy intervals before computing gaps", () => {
    const gaps = computeFreeGaps(
      [interval("2026-01-01T10:00:00Z", "2026-01-01T12:00:00Z"), interval("2026-01-01T11:00:00Z", "2026-01-01T13:00:00Z")],
      iso("2026-01-01T09:00:00Z"),
      iso("2026-01-01T14:00:00Z")
    );
    expect(gaps).toEqual([
      { start: "2026-01-01T09:00:00.000Z", end: "2026-01-01T10:00:00.000Z" },
      { start: "2026-01-01T13:00:00.000Z", end: "2026-01-01T14:00:00.000Z" },
    ]);
  });

  it("sorts out-of-order busy intervals before computing gaps", () => {
    const gaps = computeFreeGaps(
      [interval("2026-01-01T15:00:00Z", "2026-01-01T16:00:00Z"), interval("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z")],
      iso("2026-01-01T09:00:00Z"),
      iso("2026-01-01T17:00:00Z")
    );
    expect(gaps).toEqual([
      { start: "2026-01-01T09:00:00.000Z", end: "2026-01-01T10:00:00.000Z" },
      { start: "2026-01-01T11:00:00.000Z", end: "2026-01-01T15:00:00.000Z" },
      { start: "2026-01-01T16:00:00.000Z", end: "2026-01-01T17:00:00.000Z" },
    ]);
  });

  it("ignores intervals with unparseable dates rather than throwing", () => {
    const gaps = computeFreeGaps(
      [interval("not-a-date", "also-not-a-date")],
      iso("2026-01-01T00:00:00Z"),
      iso("2026-01-01T05:00:00Z")
    );
    expect(gaps).toEqual([{ start: "2026-01-01T00:00:00.000Z", end: "2026-01-01T05:00:00.000Z" }]);
  });
});
