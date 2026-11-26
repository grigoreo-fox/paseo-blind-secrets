import { describe, expect, it } from "vitest";
import { getSecretsInput, secretRowData, showSecretsInput } from "../shared/contracts";

describe("contracts", () => {
  it("getSecretsInput rejects an empty list", () => {
    expect(getSecretsInput.safeParse({ secrets: [] }).success).toBe(false);
  });

  it("getSecretsInput accepts one item", () => {
    const parsed = getSecretsInput.safeParse({
      secrets: [{ name: "app_token", path: ".secrets/app_token" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("showSecretsInput rejects an empty list", () => {
    expect(showSecretsInput.safeParse({ secrets: [] }).success).toBe(false);
  });

  it("secretRowData rejects an item that carries a value", () => {
    const row = {
      requestId: "r1",
      kind: "get",
      status: "pending",
      items: [{ label: "a", path: "p", resolvedPath: "/p", value: "x" }],
    };
    expect(() => secretRowData.parse(row)).toThrow();
  });

  it("secretRowData accepts a row without values", () => {
    const row = {
      requestId: "r1",
      kind: "show",
      status: "done",
      items: [{ label: "a", path: "p", resolvedPath: "/p" }],
    };
    expect(secretRowData.parse(row).items[0].label).toBe("a");
  });
});
