import { describe, expect, it } from "vitest";
import { maskValue } from "../client/mask";

describe("maskValue", () => {
  it("shows the value when revealed", () => {
    expect(maskValue(" abc\n", true)).toBe(" abc\n");
  });

  it("hides the value with a fixed number of dots whatever its length", () => {
    expect(maskValue("a", false)).toBe("••••••••");
    expect(maskValue("a-very-long-secret-value-0123456789", false)).toBe("••••••••");
  });

  it("shows nothing for an empty value", () => {
    expect(maskValue("", false)).toBe("");
    expect(maskValue("", true)).toBe("");
  });
});
