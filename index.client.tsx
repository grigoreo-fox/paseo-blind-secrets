import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SecretCard } from "./client/SecretCard";
import { secretRowData } from "./shared/contracts";

export default function contribute(client: PluginClientContext) {
  client.addTimelineRenderer({
    kind: "secret-request",
    version: 1,
    schema: secretRowData,
    Component: SecretCard,
  });
  return () => {};
}
