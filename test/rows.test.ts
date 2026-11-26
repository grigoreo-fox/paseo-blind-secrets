import { describe, expect, it } from "vitest";
import type { PaseoApi } from "@getpaseo/client";
import { appendRow } from "../server/rows";
import type { SecretRowData } from "../shared/contracts";

function fakePaseo() {
  const calls: Array<{ agentId: string; item: unknown }> = [];
  const paseo = {
    agents: {
      ref: (agentId: string) => ({
        timeline: { append: async (item: unknown) => void calls.push({ agentId, item }) },
      }),
    },
  } as unknown as PaseoApi;
  return { paseo, calls };
}

const data: SecretRowData = {
  requestId: "r1",
  kind: "get",
  status: "pending",
  items: [{ label: "a", path: "p", resolvedPath: "/p" }],
};

describe("appendRow", () => {
  it("appends a versioned plugin row keyed by the request id", async () => {
    const { paseo, calls } = fakePaseo();
    await appendRow(paseo, "agent-1", data);
    expect(calls).toEqual([
      {
        agentId: "agent-1",
        item: { type: "plugin", id: "r1", kind: "secret-request", version: 1, data },
      },
    ]);
  });

  it("refuses data that carries a value and appends nothing", async () => {
    const { paseo, calls } = fakePaseo();
    const bad = { ...data, items: [{ ...data.items[0], value: "S3CR3T" }] } as unknown as SecretRowData;
    await expect(appendRow(paseo, "agent-1", bad)).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
