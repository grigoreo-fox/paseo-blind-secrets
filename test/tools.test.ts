import { describe, expect, it } from "vitest";
import type { AgentToolContext, AgentToolResult } from "@getpaseo/plugin/server";
import { createRegistry } from "../server/requests";
import { MAX_SECRET_BYTES } from "../server/files";
import { createSecretService } from "../server/tools";
import type { SecretRowData } from "../shared/contracts";

const SECRET = "S3CR3T";

function setup(timeoutMs = 600_000, readable: Record<string, string> = {}) {
  const rows: SecretRowData[] = [];
  const written: Array<{ path: string; value: string }> = [];
  const registry = createRegistry({ timeoutMs });
  const service = createSecretService({
    registry,
    files: {
      write: async (path, value) => void written.push({ path, value }),
      read: async (path) => {
        if (!(path in readable)) throw new Error(`not readable: ${path}`);
        return readable[path];
      },
    },
    resolve: (cwd, input) => `${cwd}/${input}`,
    appendRow: async (_paseo, _agentId, data) => void rows.push(structuredClone(data)),
  });
  const context = (signal = new AbortController().signal) =>
    ({ agent: { id: "agent-1", cwd: "/work" }, paseo: {}, signal }) as unknown as AgentToolContext;
  const pendingId = () => rows.find((r) => r.status === "pending")!.requestId;
  const nothingLeaks = (result: AgentToolResult) => {
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(rows)).not.toContain(SECRET);
  };
  return { service, rows, written, registry, context, pendingId, nothingLeaks };
}

const ask = { secrets: [{ name: "token", path: ".secrets/token", description: "API token" }] };

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("get_secrets", () => {
  it("writes the submitted value to the resolved path and keeps it out of results and rows", async () => {
    const t = setup();
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    expect(t.rows[0]).toMatchObject({ kind: "get", status: "pending" });
    expect(t.rows[0].items[0].resolvedPath).toBe("/work/.secrets/token");
    await t.service.handlers.submit({ requestId: t.pendingId(), values: { token: SECRET } });
    const result = await run;
    expect(t.written).toEqual([{ path: "/work/.secrets/token", value: SECRET }]);
    expect(result.isError).toBeFalsy();
    expect(result.text).toBe("Wrote 1 secret(s): /work/.secrets/token");
    expect(t.rows.at(-1)?.status).toBe("done");
    t.nothingLeaks(result);
  });

  it("returns a decline error when the user rejects", async () => {
    const t = setup();
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    await t.service.handlers.reject({ requestId: t.pendingId() });
    expect(await run).toEqual({ isError: true, text: "The user declined to provide the secrets." });
    expect(t.rows.at(-1)?.status).toBe("rejected");
  });

  it("returns a timeout error and an expired row", async () => {
    const t = setup(20);
    const result = await t.service.getSecrets.execute(ask, t.context());
    expect(result).toEqual({ isError: true, text: "The user did not answer in time." });
    expect(t.rows.at(-1)?.status).toBe("expired");
  });

  it("rejects a second submit for the same request and writes once", async () => {
    const t = setup();
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    const requestId = t.pendingId();
    await t.service.handlers.submit({ requestId, values: { token: SECRET } });
    await run;
    await expect(t.service.handlers.submit({ requestId, values: { token: SECRET } })).rejects.toThrow(
      "unknown_request",
    );
    expect(t.written).toHaveLength(1);
  });

  it("rejects a submit with a label that is not in the request and keeps it pending", async () => {
    const t = setup();
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    const requestId = t.pendingId();
    await expect(
      t.service.handlers.submit({ requestId, values: { other: SECRET } }),
    ).rejects.toThrow("unknown_label");
    expect(t.written).toEqual([]);
    await t.service.handlers.reject({ requestId });
    await run;
  });

  it("rejects a submit that misses a requested label", async () => {
    const t = setup();
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    const requestId = t.pendingId();
    await expect(t.service.handlers.submit({ requestId, values: {} })).rejects.toThrow("missing_value");
    await t.service.handlers.reject({ requestId });
    await run;
  });

  it("keeps spaces and the trailing newline of the value", async () => {
    const t = setup();
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    await t.service.handlers.submit({ requestId: t.pendingId(), values: { token: " v\n" } });
    await run;
    expect(t.written[0].value).toBe(" v\n");
  });

  it("gives two concurrent requests separate ids and pending entries", async () => {
    const t = setup();
    const a = t.service.getSecrets.execute(ask, t.context());
    const b = t.service.getSecrets.execute(ask, t.context());
    await tick();
    const pending = await t.service.handlers.pending({ agentId: "agent-1" });
    expect(new Set(pending.requests.map((r) => r.requestId)).size).toBe(2);
    for (const r of pending.requests) await t.service.handlers.reject({ requestId: r.requestId });
    await Promise.all([a, b]);
  });

  it("rejects duplicate names without opening a request", async () => {
    const t = setup();
    const result = await t.service.getSecrets.execute(
      { secrets: [ask.secrets[0], ask.secrets[0]] },
      t.context(),
    );
    expect(result.isError).toBe(true);
    expect(t.rows).toEqual([]);
  });

  it("expires the row when the call is aborted", async () => {
    const t = setup();
    const controller = new AbortController();
    const run = t.service.getSecrets.execute(ask, t.context(controller.signal));
    await tick();
    controller.abort();
    await run;
    expect(t.rows.at(-1)?.status).toBe("expired");
    expect(t.registry.listForAgent("agent-1")).toEqual([]);
  });
});

describe("value size limit", () => {
  it("refuses an oversized value for any item and writes nothing", async () => {
    const t = setup();
    const two = {
      secrets: [
        { name: "a", path: "a" },
        { name: "b", path: "b" },
      ],
    };
    const run = t.service.getSecrets.execute(two, t.context());
    await tick();
    const requestId = t.pendingId();
    await expect(
      t.service.handlers.submit({
        requestId,
        values: { a: "ok", b: "x".repeat(MAX_SECRET_BYTES + 1) },
      }),
    ).rejects.toThrow("value_too_large");
    expect(t.written).toEqual([]);
    await t.service.handlers.reject({ requestId });
    await run;
  });

  it("measures the limit in bytes, not characters", async () => {
    const t = setup();
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    const requestId = t.pendingId();
    const value = "я".repeat(MAX_SECRET_BYTES / 2 + 1);
    await expect(
      t.service.handlers.submit({ requestId, values: { token: value } }),
    ).rejects.toThrow("value_too_large");
    await t.service.handlers.reject({ requestId });
    await run;
  });
});

describe("show_secrets", () => {
  const show = { secrets: [{ label: "token", path: "t" }, { label: "gone", path: "g" }] };

  it("returns values only to the reader, reports missing files per item, and leaks nothing", async () => {
    const t = setup(600_000, { "/work/t": SECRET });
    const run = t.service.showSecrets.execute(show, t.context());
    await tick();
    const requestId = t.pendingId();
    const read = await t.service.handlers.read({ requestId });
    expect(read.items).toEqual([
      { label: "token", value: SECRET },
      { label: "gone", error: "not readable: /work/g" },
    ]);
    await t.service.handlers.submit({ requestId, values: {} });
    const result = await run;
    expect(result.text).toBe("Showed 2 secret(s) to the user: /work/t, /work/g");
    t.nothingLeaks(result);
  });

  it("refuses to read a get request", async () => {
    const t = setup(600_000, { "/work/.secrets/token": SECRET });
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    const requestId = t.pendingId();
    await expect(t.service.handlers.read({ requestId })).rejects.toThrow("unknown_request");
    await t.service.handlers.reject({ requestId });
    await run;
  });

  it("refuses to read after the request has ended", async () => {
    const t = setup(600_000, { "/work/t": SECRET });
    const run = t.service.showSecrets.execute({ secrets: [show.secrets[0]] }, t.context());
    await tick();
    const requestId = t.pendingId();
    await t.service.handlers.submit({ requestId, values: {} });
    await run;
    await expect(t.service.handlers.read({ requestId })).rejects.toThrow("unknown_request");
  });
});
