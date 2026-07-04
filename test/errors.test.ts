import { describe, it, expect } from "vitest";
import { mapOsaError, McpToolError } from "../src/errors.js";

describe("mapOsaError", () => {
  it("maps -600 to APP_NOT_RUNNING", () => {
    expect(mapOsaError("execution error: Application isn't running. (-600)").code).toBe("APP_NOT_RUNNING");
  });

  it("maps -609 to APP_NOT_RUNNING", () => {
    expect(mapOsaError("Connection is invalid. (-609)").code).toBe("APP_NOT_RUNNING");
  });

  it("maps -1728 to NOT_FOUND", () => {
    expect(mapOsaError("Can't get object. (-1728)").code).toBe("NOT_FOUND");
  });

  it("maps -1743 to AUTOMATION_NOT_AUTHORIZED", () => {
    expect(mapOsaError("Not authorized to send Apple events. (-1743)").code).toBe("AUTOMATION_NOT_AUTHORIZED");
  });

  it("falls back to text match for 'not authorized' without a recognized number", () => {
    expect(mapOsaError("osascript is not allowed to send Apple events to Mail.").code).toBe("AUTOMATION_NOT_AUTHORIZED");
  });

  it("falls back to text match for app-not-running phrasing", () => {
    expect(mapOsaError("Mail isn't running.").code).toBe("APP_NOT_RUNNING");
  });

  it("maps unrecognized errors to UNEXPECTED_OSA_ERROR", () => {
    expect(mapOsaError("some completely novel failure").code).toBe("UNEXPECTED_OSA_ERROR");
  });

  it("preserves the raw message on the resulting error", () => {
    const err = mapOsaError("  padded message  ");
    expect(err.message).toBe("padded message");
  });
});

describe("McpToolError", () => {
  it("round-trips through toContent()", () => {
    const err = new McpToolError("NOT_FOUND", "no such thing", { extra: 1 });
    expect(err.toContent()).toEqual({ code: "NOT_FOUND", message: "no such thing", detail: { extra: 1 } });
  });
});
