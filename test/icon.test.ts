import { describe, expect, it } from "vitest";
import { findSvgIconProblem, PLUGIN_SVG_ICON_MAX_BYTES } from "@getpaseo/plugin";
import { blindEyeSvg } from "../client/icons";

describe("blindEyeSvg", () => {
  it("is accepted by Paseo's SVG rules", () => {
    expect(findSvgIconProblem(blindEyeSvg)).toBeNull();
  });

  it("is small", () => {
    expect(Buffer.byteLength(blindEyeSvg, "utf8")).toBeLessThan(PLUGIN_SVG_ICON_MAX_BYTES / 16);
  });

  it("follows the host colour instead of hardcoding one", () => {
    expect(blindEyeSvg).toContain('fill="currentColor"');
    expect(blindEyeSvg).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(blindEyeSvg).not.toContain("rgb(");
  });

  it("is a traced silhouette with no background and a square viewBox", () => {
    expect(blindEyeSvg).not.toMatch(/<rect/);
    const box = blindEyeSvg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
    expect(box).not.toBeNull();
    expect(box![1]).toBe(box![2]);
    expect(blindEyeSvg.match(/<path/g)?.length).toBe(1);
  });
});
