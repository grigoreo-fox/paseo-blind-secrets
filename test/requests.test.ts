import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistry } from "../server/requests";
import type { SecretRowData } from "../shared/contracts";

function row(requestId: string): SecretRowData {
  return {
    requestId,
    kind: "get",
    status: "pending",
    items: [{ label: "a", path: "p", resolvedPath: "/p" }],
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("registry", () => {
  it("settle resolves the outcome once, then returns false", async () => {
    const registry = createRegistry();
    const { id, outcome } = registry.open({ agentId: "a1", data: row("r1") });
    expect(registry.settle(id, { kind: "submitted" })).toBe(true);
    expect(await outcome).toEqual({ kind: "submitted" });
    expect(registry.settle(id, { kind: "submitted" })).toBe(false);
  });

  it("settle returns false for an unknown id", () => {
    expect(createRegistry().settle("nope", { kind: "rejected" })).toBe(false);
  });

  it("expires after the timeout and forgets the request", async () => {
    const registry = createRegistry({ timeoutMs: 1000 });
    const { id, outcome } = registry.open({ agentId: "a1", data: row("r1") });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await outcome).toEqual({ kind: "expired" });
    expect(registry.get(id)).toBeUndefined();
  });

  it("expires when the signal aborts", async () => {
    const registry = createRegistry();
    const controller = new AbortController();
    const { outcome } = registry.open({ agentId: "a1", data: row("r1"), signal: controller.signal });
    controller.abort();
    expect(await outcome).toEqual({ kind: "expired" });
  });

  it("expires at once when the signal is already aborted", async () => {
    const registry = createRegistry();
    const controller = new AbortController();
    controller.abort();
    const { outcome } = registry.open({ agentId: "a1", data: row("r1"), signal: controller.signal });
    expect(await outcome).toEqual({ kind: "expired" });
  });

  it("lists only pending requests of that agent", () => {
    const registry = createRegistry();
    registry.open({ agentId: "a1", data: row("r1") });
    registry.open({ agentId: "a1", data: row("r2") });
    registry.open({ agentId: "a2", data: row("r3") });
    expect(registry.listForAgent("a1").map((r) => r.requestId)).toEqual(["r1", "r2"]);
  });

  it("does not list a settled request", () => {
    const registry = createRegistry();
    registry.open({ agentId: "a1", data: row("r1") });
    registry.settle("r1", { kind: "rejected" });
    expect(registry.listForAgent("a1")).toEqual([]);
  });

  it("notifies listeners with done, rejected and expired", async () => {
    const registry = createRegistry({ timeoutMs: 1000 });
    const seen: string[] = [];
    registry.onChange((id, status) => seen.push(`${id}:${status}`));
    registry.open({ agentId: "a", data: row("r1") });
    registry.open({ agentId: "a", data: row("r2") });
    registry.open({ agentId: "a", data: row("r3") });
    registry.settle("r1", { kind: "submitted" });
    registry.settle("r2", { kind: "rejected" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen).toEqual(["r1:done", "r2:rejected", "r3:expired"]);
  });

  it("stops notifying after the listener is removed", () => {
    const registry = createRegistry();
    const seen: string[] = [];
    const off = registry.onChange((id) => seen.push(id));
    off();
    registry.open({ agentId: "a", data: row("r1") });
    registry.settle("r1", { kind: "rejected" });
    expect(seen).toEqual([]);
  });
});
