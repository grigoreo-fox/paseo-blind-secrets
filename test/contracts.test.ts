import { describe, expect, it } from "vitest";
import { requestSecretsInput, secretRowData, sendSecretsInput } from "../shared/contracts";

describe("contracts", () => {
  it("requestSecretsInput rejects an empty list", () => {
    expect(requestSecretsInput.safeParse({ secrets: [] }).success).toBe(false);
  });

  it("requestSecretsInput accepts one item", () => {
    const parsed = requestSecretsInput.safeParse({
      secrets: [{ name: "app_token", path: ".secrets/app_token" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("sendSecretsInput rejects an empty list", () => {
    expect(sendSecretsInput.safeParse({ secrets: [] }).success).toBe(false);
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

  it("requestSecretsInput accepts multiline and a known format", () => {
    const parsed = requestSecretsInput.safeParse({
      secrets: [{ name: "k", path: "k.pem", multiline: true, format: "pem" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("requestSecretsInput refuses an unknown format", () => {
    expect(
      requestSecretsInput.safeParse({ secrets: [{ name: "k", path: "k", format: "xml" }] }).success,
    ).toBe(false);
  });

  it("secretRowData carries multiline and format but still no value", () => {
    const row = {
      requestId: "r1",
      kind: "get",
      status: "pending",
      items: [{ label: "k", path: "p", resolvedPath: "/p", multiline: true, format: "json" }],
    };
    expect(secretRowData.parse(row).items[0].format).toBe("json");
    expect(() =>
      secretRowData.parse({ ...row, items: [{ ...row.items[0], value: "x" }] }),
    ).toThrow();
  });
});
