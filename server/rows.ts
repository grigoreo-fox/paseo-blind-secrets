import type { PaseoApi } from "@getpaseo/client";
import type { SecretRowData } from "../shared/contracts";

export type AppendRow = (paseo: PaseoApi, agentId: string, data: SecretRowData) => Promise<void>;

export const appendRow: AppendRow = async (paseo, agentId, data) => {
  await paseo.agents.ref(agentId).timeline.append({
    type: "plugin",
    id: data.requestId,
    kind: "secret-request",
    version: 1,
    data,
  });
};
