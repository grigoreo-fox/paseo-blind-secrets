import { describe, expect, it } from "vitest";
import { resolveSecretPath } from "../server/paths";

describe("resolveSecretPath", () => {
  it("resolves a relative path against cwd", () => {
    expect(resolveSecretPath("/work/app", ".secrets/app_token")).toBe("/work/app/.secrets/app_token");
  });

  it("expands ~/ with the given home", () => {
    expect(resolveSecretPath("/work/app", "~/x", "/home/u")).toBe("/home/u/x");
  });

  it("expands a bare ~", () => {
    expect(resolveSecretPath("/work/app", "~", "/home/u")).toBe("/home/u");
  });

  it("keeps an absolute path", () => {
    expect(resolveSecretPath("/work/app", "/etc/x")).toBe("/etc/x");
  });

  it("normalizes .. segments", () => {
    expect(resolveSecretPath("/work/app", "../other/k")).toBe("/work/other/k");
  });
});
