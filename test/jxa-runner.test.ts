import { describe, it, expect } from "vitest";
import { parseEnvelope } from "../src/jxa/runner.js";

describe("parseEnvelope", () => {
  it("parses a well-formed success envelope", () => {
    const result = parseEnvelope("test", '{"ok":true,"data":{"foo":1}}', "");
    expect(result).toEqual({ ok: true, data: { foo: 1 } });
  });

  it("parses a well-formed failure envelope", () => {
    const result = parseEnvelope("test", '{"ok":false,"error":{"code":"NOT_FOUND","message":"nope"}}', "");
    expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND", message: "nope" } });
  });

  it("falls back to mapped stderr when stdout is empty", () => {
    const result = parseEnvelope("test", "", "Application isn't running. (-600)");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("APP_NOT_RUNNING");
  });

  it("falls back to mapped stderr when stdout is malformed JSON (e.g. truncated)", () => {
    const result = parseEnvelope("test", '{"ok":true,"data":{"foo":', "unexpected osascript crash");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNEXPECTED_OSA_ERROR");
  });

  it("trims surrounding whitespace before parsing", () => {
    const result = parseEnvelope("test", '  \n{"ok":true,"data":42}\n  ', "");
    expect(result).toEqual({ ok: true, data: 42 });
  });
});
