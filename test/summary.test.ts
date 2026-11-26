import { describe, expect, it } from "vitest";
import { describeValue, isMultiline } from "../client/summary";

const PEM = "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n";

describe("isMultiline", () => {
  it("is true for an explicit multiline item", () => {
    expect(isMultiline({ multiline: true })).toBe(true);
  });

  it("is true when a json or pem format is requested, even without the flag", () => {
    expect(isMultiline({ format: "pem" })).toBe(true);
    expect(isMultiline({ format: "json" })).toBe(true);
  });

  it("is false for a plain secret and for format any", () => {
    expect(isMultiline({})).toBe(false);
    expect(isMultiline({ format: "any" })).toBe(false);
  });
});

describe("describeValue", () => {
  it("uses the requested format as the kind", () => {
    expect(describeValue("anything\nelse", "pem").kind).toBe("pem");
    expect(describeValue("x", "json").kind).toBe("json");
  });

  it("detects the kind when no format was requested", () => {
    expect(describeValue(PEM).kind).toBe("pem");
    expect(describeValue('{"a":1}').kind).toBe("json");
    expect(describeValue("one\ntwo").kind).toBe("text");
  });

  it("reports lines and a size in B or KiB", () => {
    expect(describeValue(PEM)).toMatchObject({ lines: 3, size: { unit: "B", value: String(PEM.length) } });
    expect(describeValue("x\n".repeat(1000)).size).toEqual({ unit: "KiB", value: "2" });
  });
});
