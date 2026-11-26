import { describe, expect, it } from "vitest";
import { applyRules } from "../server/rules";
import { DEFAULT_RULES, rulesSettings } from "../shared/rules";

const base = { provider: "opencode", cwd: "/w" };

describe("default rules", () => {
  it("name both tools and forbid taking or reading secrets in chat", () => {
    expect(DEFAULT_RULES).toContain("request_secrets");
    expect(DEFAULT_RULES).toContain("send_secrets");
    expect(DEFAULT_RULES).toMatch(/never ask .* in chat/i);
    expect(DEFAULT_RULES).toMatch(/never read/i);
    expect(DEFAULT_RULES).toMatch(/tell the user and stop/i);
  });

  it("are the schema default, so parsing an empty document gives a complete one", () => {
    const parsed = rulesSettings.schema.parse({});
    expect(parsed).toEqual({ enabled: true, text: DEFAULT_RULES });
  });
});

describe("applyRules", () => {
  it("does nothing when switched off", () => {
    expect(applyRules(base, { enabled: false, text: "rules" })).toBeUndefined();
  });

  it("does nothing for blank text", () => {
    expect(applyRules(base, { enabled: true, text: "  \n " })).toBeUndefined();
  });

  it("sets the system prompt when the agent has none", () => {
    expect(applyRules(base, { enabled: true, text: "rules" })).toEqual({ ...base, systemPrompt: "rules" });
  });

  it("appends after an existing system prompt instead of replacing it", () => {
    const result = applyRules({ ...base, systemPrompt: "be brief" }, { enabled: true, text: "rules" });
    expect(result?.systemPrompt).toBe("be brief\n\nrules");
  });

  it("does not add the same rules twice", () => {
    expect(applyRules({ ...base, systemPrompt: "x\n\nrules" }, { enabled: true, text: "rules" })).toBeUndefined();
  });

  it("trims the edited text", () => {
    const result = applyRules<{ systemPrompt?: string }>({}, { enabled: true, text: "\n rules \n" });
    expect(result?.systemPrompt).toBe("rules");
  });

  it("keeps every other field of the config", () => {
    const result = applyRules({ ...base, title: "t", modeId: "build" }, { enabled: true, text: "r" });
    expect(result).toMatchObject({ provider: "opencode", cwd: "/w", title: "t", modeId: "build" });
  });
});
