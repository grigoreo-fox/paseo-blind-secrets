import type { PaseoApi } from "@getpaseo/client";
import { secretRowData, type SecretRowData } from "../shared/contracts";

export type AppendRow = (paseo: PaseoApi, agentId: string, data: SecretRowData) => Promise<void>;

export const appendRow: AppendRow = async (paseo, agentId, data) => {
  const checked = secretRowData.parse(data);
  await paseo.agents.ref(agentId).timeline.append({
    type: "plugin",
    id: checked.requestId,
    kind: "secret-request",
    version: 1,
    data: checked,
  });
};
