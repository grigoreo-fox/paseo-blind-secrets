import { randomUUID } from "node:crypto";
import {
  defineAgentTool,
  type AgentToolContext,
  type AgentToolResult,
} from "@getpaseo/plugin/server";
import {
  getSecretsInput,
  showSecretsInput,
  type SecretRowData,
} from "../shared/contracts";
import { MAX_SECRET_BYTES } from "./files";
import type { Outcome, Registry } from "./requests";
import type { AppendRow } from "./rows";

export interface SecretDeps {
  registry: Registry;
  files: {
    write(absPath: string, value: string): Promise<void>;
    read(absPath: string): Promise<string>;
  };
  resolve(cwd: string, input: string): string;
  appendRow: AppendRow;
}

type Items = SecretRowData["items"];

const DECLINED = "The user declined to provide the secrets.";
const TIMEOUT = "The user did not answer in time.";

function duplicate(labels: string[]): boolean {
  return new Set(labels).size !== labels.length;
}

export function createSecretService(deps: SecretDeps) {
  const { registry, files } = deps;

  async function run(
    kind: SecretRowData["kind"],
    items: Items,
    context: Pick<AgentToolContext, "agent" | "paseo" | "signal">,
  ): Promise<Outcome> {
    const data: SecretRowData = { requestId: randomUUID(), kind, status: "pending", items };
    const { outcome } = registry.open({ agentId: context.agent.id, data, signal: context.signal });
    await deps.appendRow(context.paseo, context.agent.id, data);
    const result = await outcome;
    const status = { submitted: "done", rejected: "rejected", expired: "expired" } as const;
    await deps
      .appendRow(context.paseo, context.agent.id, { ...data, status: status[result.kind] })
      .catch(() => undefined);
    return result;
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
      const outcome = await run("get", items, context);
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
      const outcome = await run("show", items, context);
      if (outcome.kind === "expired") return failure(outcome);
      return {
        text: `Showed ${items.length} secret(s) to the user: ${items.map((i) => i.resolvedPath).join(", ")}`,
      };
    },
  });

  function pendingOf(requestId: string, kind?: SecretRowData["kind"]): SecretRowData {
    const data = registry.get(requestId);
    if (!data || (kind && data.kind !== kind)) throw new Error("unknown_request");
    return data;
  }

  const handlers = {
    async submit({ requestId, values }: { requestId: string; values: Record<string, string> }) {
      const data = pendingOf(requestId);
      if (data.kind === "get") {
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
        for (const item of data.items) await files.write(item.resolvedPath, values[item.label]);
      }
      registry.settle(requestId, { kind: "submitted" });
      return { ok: true as const };
    },
    async reject({ requestId }: { requestId: string }) {
      pendingOf(requestId);
      registry.settle(requestId, { kind: "rejected" });
      return { ok: true as const };
    },
    async read({ requestId }: { requestId: string }) {
      const data = pendingOf(requestId, "show");
      const items = await Promise.all(
        data.items.map(async (item) => {
          try {
            return { label: item.label, value: await files.read(item.resolvedPath) };
          } catch (error) {
            return { label: item.label, error: (error as Error).message };
          }
        }),
      );
      return { items };
    },
    async pending({ agentId }: { agentId: string }) {
      return { requests: registry.listForAgent(agentId) };
    },
  };

  return { getSecrets, showSecrets, handlers };
}
