import { describe, expect, it } from "vitest";
import type { AgentToolDefinition } from "@getpaseo/plugin/server";
import { attachTools } from "../server/hook";

const tool = (name: string) => ({ name }) as unknown as AgentToolDefinition;
const base = { background: false, purpose: "interactive", tools: [tool("existing")] };

describe("attachTools", () => {
  it("adds the tools for an interactive foreground agent, keeping existing ones", () => {
    const result = attachTools(base, [tool("a"), tool("b")]);
    expect(result?.tools.map((t) => t.name)).toEqual(["existing", "a", "b"]);
  });

  it("does nothing for a background agent", () => {
    expect(attachTools({ ...base, background: true }, [tool("a")])).toBeUndefined();
  });

  it("does nothing when the session is only reading history", () => {
    expect(attachTools({ ...base, purpose: "history" }, [tool("a")])).toBeUndefined();
  });
});
