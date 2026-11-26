import { randomUUID } from "node:crypto";
import {
  defineAgentTool,
  type AgentToolContext,
  type AgentToolResult,
} from "@getpaseo/plugin/server";
import { getSecretsInput, showSecretsInput, type SecretRowData } from "../shared/contracts";
import { MAX_SECRET_BYTES, type Staged } from "./files";
import type { Outcome, Registry } from "./requests";
import type { AppendRow } from "./rows";

export interface SecretDeps {
  registry: Registry;
  files: {
    stage(absPath: string, value: string): Promise<Staged>;
    read(absPath: string): Promise<string>;
  };
  resolve(cwd: string, input: string): string;
  appendRow: AppendRow;
}

type Items = SecretRowData["items"];

const DECLINED = "The user declined to provide the secrets.";
const TIMEOUT = "The user did not answer in time.";
const STATUS = { submitted: "done", rejected: "rejected", expired: "expired" } as const;

function duplicate(labels: string[]): boolean {
  return new Set(labels).size !== labels.length;
}

function reason(error: string): string {
  const cut = error.indexOf(": ");
  return cut === -1 ? error : error.slice(0, cut);
}

export function createSecretService(deps: SecretDeps) {
  const { registry, files } = deps;
  const readErrors = new Map<string, Map<string, string>>();

  async function run(
    kind: SecretRowData["kind"],
    items: Items,
    context: Pick<AgentToolContext, "agent" | "paseo" | "signal">,
  ): Promise<{ outcome: Outcome; errors: Map<string, string> }> {
    const data: SecretRowData = { requestId: randomUUID(), kind, status: "pending", items };
    const { id, outcome: waiting } = registry.open({
      agentId: context.agent.id,
      data,
      signal: context.signal,
    });
    try {
      await deps.appendRow(context.paseo, context.agent.id, data);
    } catch (error) {
      registry.settle(id, { kind: "expired" });
      throw error;
    }
    const outcome = await waiting;
    const errors = readErrors.get(id) ?? new Map<string, string>();
    readErrors.delete(id);
    const finalItems = items.map((item) =>
      errors.has(item.label) ? { ...item, error: errors.get(item.label) } : item,
    );
    await deps
      .appendRow(context.paseo, context.agent.id, {
        ...data,
        items: finalItems,
        status: STATUS[outcome.kind],
      })
      .catch(() => undefined);
    return { outcome, errors };
  }

  function failure(outcome: Outcome): AgentToolResult {
    return { isError: true, text: outcome.kind === "rejected" ? DECLINED : TIMEOUT };
  }

  const getSecrets = defineAgentTool({
    name: "get_secrets",
    title: "Get secrets from the user",
    description:
      "Ask the user for secrets (API keys, passwords, tokens). The user types the values into a private form and they are written to the files you name. You never see the values. Each secret has a name, a file path and an optional description. Existing files are overwritten. Waits until the user answers.",
    input: getSecretsInput,
    async execute({ secrets }, context) {
      if (duplicate(secrets.map((s) => s.name))) {
        return { isError: true, text: "Secret names must be unique." };
      }
      const items: Items = secrets.map((s) => ({
        label: s.name,
        path: s.path,
        resolvedPath: deps.resolve(context.agent.cwd, s.path),
        ...(s.description ? { description: s.description } : {}),
      }));
      const { outcome } = await run("get", items, context);
      if (outcome.kind !== "submitted") return failure(outcome);
      return { text: `Wrote ${items.length} secret(s): ${items.map((i) => i.resolvedPath).join(", ")}` };
    },
  });

  const showSecrets = defineAgentTool({
    name: "show_secrets",
    title: "Show secrets to the user",
    description:
      "Show the user the content of secret files (for example a generated password or API key) in a private card with a copy button. You never see the values. Each secret has a label and a file path. Waits until the user closes the card.",
    input: showSecretsInput,
    async execute({ secrets }, context) {
      if (duplicate(secrets.map((s) => s.label))) {
        return { isError: true, text: "Secret labels must be unique." };
      }
      const items: Items = secrets.map((s) => ({
        label: s.label,
        path: s.path,
        resolvedPath: deps.resolve(context.agent.cwd, s.path),
      }));
      const { outcome, errors } = await run("show", items, context);
      if (outcome.kind !== "submitted") return failure(outcome);
      const shown = items.filter((i) => !errors.has(i.label));
      const failed = items.filter((i) => errors.has(i.label));
      const shownPaths = shown.map((i) => i.resolvedPath).join(", ");
      if (failed.length === 0) {
        return { text: `Showed ${items.length} secret(s) to the user: ${shownPaths}` };
      }
      const notShown = failed
        .map((i) => `${i.resolvedPath} (${reason(errors.get(i.label)!)})`)
        .join(", ");
      if (shown.length === 0) {
        return { isError: true, text: `None of the secrets could be shown. Not shown: ${notShown}` };
      }
      return {
        text: `Showed ${shown.length} of ${items.length} secret(s) to the user: ${shownPaths}. Not shown: ${notShown}`,
      };
    },
  });

  function pendingOf(requestId: string, kind?: SecretRowData["kind"]): SecretRowData {
    const data = registry.get(requestId);
    if (!data || (kind && data.kind !== kind)) throw new Error("unknown_request");
    return data;
  }

  async function commitAll(data: SecretRowData, values: Record<string, string>): Promise<void> {
    const staged: Staged[] = [];
    try {
      for (const item of data.items) staged.push(await files.stage(item.resolvedPath, values[item.label]));
      for (const [index, file] of staged.entries()) {
        try {
          await file.commit();
        } catch (error) {
          await Promise.all(staged.slice(index + 1).map((rest) => rest.discard()));
          throw error;
        }
      }
    } catch (error) {
      await Promise.all(staged.map((file) => file.discard()));
      throw error;
    }
  }

  const handlers = {
    async submit({ requestId, values }: { requestId: string; values: Record<string, string> }) {
      const data = pendingOf(requestId);
      if (data.kind === "show") {
        registry.settle(requestId, { kind: "submitted" });
        return { ok: true as const };
      }
      const labels = data.items.map((i) => i.label);
      for (const label of Object.keys(values)) {
        if (!labels.includes(label)) throw new Error("unknown_label");
      }
      for (const label of labels) {
        if (!(label in values)) throw new Error("missing_value");
        if (Buffer.byteLength(values[label], "utf8") > MAX_SECRET_BYTES) {
          throw new Error("value_too_large");
        }
      }
      if (!registry.claim(requestId)) throw new Error("request_busy");
      try {
        await commitAll(data, values);
      } catch (error) {
        registry.release(requestId);
        throw error;
      }
      registry.settle(requestId, { kind: "submitted" }, { claimed: true });
      return { ok: true as const };
    },
    async reject({ requestId }: { requestId: string }) {
      pendingOf(requestId);
      if (!registry.settle(requestId, { kind: "rejected" })) throw new Error("request_busy");
      return { ok: true as const };
    },
    async read({ requestId }: { requestId: string }) {
      const data = pendingOf(requestId, "show");
      const errors = new Map<string, string>();
      const items = await Promise.all(
        data.items.map(async (item) => {
          try {
            return { label: item.label, value: await files.read(item.resolvedPath) };
          } catch (error) {
            const message = (error as Error).message;
            errors.set(item.label, message);
            return { label: item.label, error: message };
          }
        }),
      );
      readErrors.set(requestId, errors);
      return { items };
    },
    async pending({ agentId }: { agentId: string }) {
      return { requests: registry.listForAgent(agentId) };
    },
  };

  return { getSecrets, showSecrets, handlers };
}
