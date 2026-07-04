import { describe, it, expect } from "vitest";
import { requireConfirm } from "../src/tools/register.js";
import { McpToolError } from "../src/errors.js";

describe("requireConfirm", () => {
  it("throws when confirm is undefined", () => {
    expect(() => requireConfirm(undefined, "do the thing")).toThrow(McpToolError);
  });

  it("throws when confirm is false", () => {
    expect(() => requireConfirm(false, "do the thing")).toThrow(McpToolError);
  });

  it("does not throw when confirm is true", () => {
    expect(() => requireConfirm(true, "do the thing")).not.toThrow();
  });

  it("throws with INVALID_INPUT code and a message naming the action", () => {
    try {
      requireConfirm(undefined, "permanently delete this message");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(McpToolError);
      expect((e as McpToolError).code).toBe("INVALID_INPUT");
      expect((e as McpToolError).message).toContain("permanently delete this message");
    }
  });
});
