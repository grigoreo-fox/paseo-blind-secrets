import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentToolContext, AgentToolResult } from "@getpaseo/plugin/server";
import { MAX_SECRET_BYTES } from "../server/files";
import { createRegistry } from "../server/requests";
import { createSecretService } from "../server/tools";
import type { SecretRowData } from "../shared/contracts";

const SECRET = "S3CR3T";

interface Options {
  timeoutMs?: number;
  readable?: Record<string, string>;
  gate?: Promise<void>;
  failStage?: string;
  failAppend?: boolean;
  failCheck?: Record<string, string>;
  failAfterFirstRead?: string[];
}

function setup(options: Options = {}) {
  const { timeoutMs = 600_000, readable = {}, gate, failStage, failAppend, failCheck = {}, failAfterFirstRead = [] } =
    options;
  const reads = new Map<string, number>();
  const rows: SecretRowData[] = [];
  const written: Array<{ path: string; value: string }> = [];
  const discarded: string[] = [];
  const registry = createRegistry({ timeoutMs });
  const service = createSecretService({
    registry,
    files: {
      stage: async (path, value) => {
        if (path === failStage) throw new Error(`write failed: ${path}`);
        return {
          commit: async () => {
            await gate;
            written.push({ path, value });
          },
          discard: async () => void discarded.push(path),
        };
      },
      checkWritable: async (path) => {
        if (path in failCheck) throw new Error(`${failCheck[path]}: ${path}`);
      },
      read: async (path) => {
        reads.set(path, (reads.get(path) ?? 0) + 1);
        if (failAfterFirstRead.includes(path) && reads.get(path)! > 1) {
          throw new Error(`not readable: ${path}`);
        }
        if (!(path in readable)) throw new Error(`not readable: ${path}`);
        const value = readable[path];
        if (value === "<binary>") throw new Error(`not text: ${path}`);
        return value;
      },
    },
    resolve: (cwd, input) => resolvePath(cwd, input),
    appendRow: async (_paseo, _agentId, data) => {
      if (failAppend) throw new Error("append failed");
      rows.push(structuredClone(data));
    },
  });
  const context = (signal = new AbortController().signal) =>
    ({ agent: { id: "agent-1", cwd: "/work" }, paseo: {}, signal }) as unknown as AgentToolContext;
  const pendingId = () => rows.find((r) => r.status === "pending")!.requestId;
  const nothingLeaks = (result: AgentToolResult) => {
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(rows)).not.toContain(SECRET);
  };
  return { service, rows, written, discarded, registry, context, pendingId, nothingLeaks };
}

const ask = { secrets: [{ name: "token", path: ".secrets/token", description: "API token" }] };
const two = {
  secrets: [
    { name: "a", path: "a" },
    { name: "b", path: "b" },
  ],
};

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
    const t = setup({ timeoutMs: 20 });
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

  it("writes once when two submits race while the first write is slow", async () => {
    let open!: () => void;
    const t = setup({ gate: new Promise<void>((resolve) => (open = resolve)) });
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    const requestId = t.pendingId();
    const first = t.service.handlers.submit({ requestId, values: { token: SECRET } });
    const second = t.service.handlers.submit({ requestId, values: { token: "other" } });
    const settled = Promise.allSettled([first, second]);
    await tick();
    open();
    const results = await settled;
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    await run;
    expect(t.written).toEqual([{ path: "/work/.secrets/token", value: SECRET }]);
  });

  it("reports success, not expiry, when the timeout hits during a slow write", async () => {
    let open!: () => void;
    const t = setup({ timeoutMs: 30, gate: new Promise<void>((resolve) => (open = resolve)) });
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    const submit = t.service.handlers.submit({ requestId: t.pendingId(), values: { token: SECRET } });
    await new Promise((resolve) => setTimeout(resolve, 80));
    open();
    await submit;
    const result = await run;
    expect(result.isError).toBeFalsy();
    expect(t.written).toHaveLength(1);
    expect(t.rows.at(-1)?.status).toBe("done");
  });

  it("refuses a reject while the files are being written", async () => {
    let open!: () => void;
    const t = setup({ gate: new Promise<void>((resolve) => (open = resolve)) });
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    const requestId = t.pendingId();
    const submit = t.service.handlers.submit({ requestId, values: { token: SECRET } });
    await tick();
    await expect(t.service.handlers.reject({ requestId })).rejects.toThrow("request_busy");
    open();
    await submit;
    expect((await run).isError).toBeFalsy();
  });

  it("writes nothing when staging the second file fails, and the request stays pending", async () => {
    const t = setup({ failStage: "/work/b" });
    const run = t.service.getSecrets.execute(two, t.context());
    await tick();
    const requestId = t.pendingId();
    await expect(
      t.service.handlers.submit({ requestId, values: { a: SECRET, b: "x" } }),
    ).rejects.toThrow("write failed: /work/b");
    expect(t.written).toEqual([]);
    expect(t.discarded).toEqual(["/work/a"]);
    expect(t.registry.get(requestId)).toBeDefined();
    await t.service.handlers.submit({ requestId, values: { a: "1", b: "2" } }).catch(() => undefined);
    await t.service.handlers.reject({ requestId }).catch(() => undefined);
    await run;
  });

  it("rejects a submit with a label that is not in the request and keeps it pending", async () => {
    const t = setup();
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    const requestId = t.pendingId();
    await expect(t.service.handlers.submit({ requestId, values: { other: SECRET } })).rejects.toThrow(
      "unknown_label",
    );
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

  it("gives two concurrent requests separate ids, rows and pending entries", async () => {
    const t = setup();
    const a = t.service.getSecrets.execute(ask, t.context());
    const b = t.service.getSecrets.execute(ask, t.context());
    await tick();
    const pending = await t.service.handlers.pending({ agentId: "agent-1" });
    expect(new Set(pending.requests.map((r) => r.requestId)).size).toBe(2);
    expect(new Set(t.rows.map((r) => r.requestId)).size).toBe(2);
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

  it("does not leave a request behind when the first row cannot be appended", async () => {
    const t = setup({ failAppend: true });
    await expect(t.service.getSecrets.execute(ask, t.context())).rejects.toThrow("append failed");
    expect(t.registry.listForAgent("agent-1")).toEqual([]);
  });
});

describe("value size limit", () => {
  it("refuses an oversized value for any item and writes nothing", async () => {
    const t = setup();
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
    await expect(t.service.handlers.submit({ requestId, values: { token: value } })).rejects.toThrow(
      "value_too_large",
    );
    await t.service.handlers.reject({ requestId });
    await run;
  });
});

describe("show_secrets", () => {
  const show = {
    secrets: [
      { label: "token", path: "t" },
      { label: "gone", path: "g" },
    ],
  };

  it("returns values only to the reader and leaks nothing", async () => {
    const t = setup({ readable: { "/work/t": SECRET } });
    const run = t.service.showSecrets.execute({ secrets: [show.secrets[0]] }, t.context());
    await tick();
    const requestId = t.pendingId();
    const read = await t.service.handlers.read({ requestId });
    expect(read.items).toEqual([{ label: "token", value: SECRET }]);
    await t.service.handlers.submit({ requestId, values: {} });
    const result = await run;
    expect(result.text).toBe("Showed 1 secret(s) to the user: /work/t");
    t.nothingLeaks(result);
  });

  it("names the files that vanished after the check and marks them in the row", async () => {
    const t = setup({ readable: { "/work/t": SECRET, "/work/g": SECRET }, failAfterFirstRead: ["/work/g"] });
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
    expect(result.isError).toBeFalsy();
    expect(result.text).toBe(
      "Showed 1 of 2 secret(s) to the user: /work/t. Not shown: /work/g (not readable)",
    );
    expect(t.rows.at(-1)?.items[1].error).toBe("not readable: /work/g");
    t.nothingLeaks(result);
  });

  it("returns an error when no file could be shown after the check", async () => {
    const t = setup({
      readable: { "/work/t": SECRET, "/work/g": SECRET },
      failAfterFirstRead: ["/work/t", "/work/g"],
    });
    const run = t.service.showSecrets.execute(show, t.context());
    await tick();
    const requestId = t.pendingId();
    await t.service.handlers.read({ requestId });
    await t.service.handlers.submit({ requestId, values: {} });
    expect(await run).toEqual({
      isError: true,
      text: "None of the secrets could be shown. Not shown: /work/t (not readable), /work/g (not readable)",
    });
  });

  it("returns the decline text when a show request is rejected", async () => {
    const t = setup({ readable: { "/work/t": SECRET } });
    const run = t.service.showSecrets.execute({ secrets: [show.secrets[0]] }, t.context());
    await tick();
    await t.service.handlers.reject({ requestId: t.pendingId() });
    expect(await run).toEqual({ isError: true, text: "The user declined to provide the secrets." });
  });

  it("refuses to read a get request", async () => {
    const t = setup({ readable: { "/work/.secrets/token": SECRET } });
    const run = t.service.getSecrets.execute(ask, t.context());
    await tick();
    const requestId = t.pendingId();
    await expect(t.service.handlers.read({ requestId })).rejects.toThrow("unknown_request");
    await t.service.handlers.reject({ requestId });
    await run;
  });

  it("refuses to read after the request has ended", async () => {
    const t = setup({ readable: { "/work/t": SECRET } });
    const run = t.service.showSecrets.execute({ secrets: [show.secrets[0]] }, t.context());
    await tick();
    const requestId = t.pendingId();
    await t.service.handlers.submit({ requestId, values: {} });
    await run;
    await expect(t.service.handlers.read({ requestId })).rejects.toThrow("unknown_request");
  });
});

describe("checks before the user is asked", () => {
  const show = {
    secrets: [
      { label: "token", path: "t" },
      { label: "gone", path: "g" },
      { label: "bin", path: "b" },
    ],
  };

  it("show_secrets returns every unreadable file to the agent and shows no card", async () => {
    const t = setup({ readable: { "/work/t": SECRET, "/work/b": "<binary>" } });
    const result = await t.service.showSecrets.execute(show, t.context());
    expect(result).toEqual({
      isError: true,
      text: "Cannot show: /work/g (not readable), /work/b (not text). The user was not asked.",
    });
    expect(t.rows).toEqual([]);
    expect(t.registry.listForAgent("agent-1")).toEqual([]);
    t.nothingLeaks(result);
  });

  it("show_secrets opens the card when every file passes", async () => {
    const t = setup({ readable: { "/work/t": SECRET } });
    const run = t.service.showSecrets.execute({ secrets: [show.secrets[0]] }, t.context());
    await tick();
    expect(t.rows[0].status).toBe("pending");
    await t.service.handlers.submit({ requestId: t.pendingId(), values: {} });
    expect((await run).isError).toBeFalsy();
  });

  it("get_secrets returns unwritable targets to the agent and shows no card", async () => {
    const t = setup({ failCheck: { "/work/b": "is a directory" } });
    const result = await t.service.getSecrets.execute(two, t.context());
    expect(result).toEqual({
      isError: true,
      text: "Cannot write: /work/b (is a directory). The user was not asked.",
    });
    expect(t.rows).toEqual([]);
    expect(t.registry.listForAgent("agent-1")).toEqual([]);
  });

  it("get_secrets refuses two secrets that resolve to the same file", async () => {
    const t = setup();
    const result = await t.service.getSecrets.execute(
      {
        secrets: [
          { name: "a", path: "x" },
          { name: "b", path: "./x" },
        ],
      },
      t.context(),
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("same file");
    expect(t.rows).toEqual([]);
  });

  it("get_secrets lists every unwritable target", async () => {
    const t = setup({ failCheck: { "/work/a": "not writable", "/work/b": "is a directory" } });
    const result = await t.service.getSecrets.execute(two, t.context());
    expect(result.text).toBe(
      "Cannot write: /work/a (not writable), /work/b (is a directory). The user was not asked.",
    );
  });
});
