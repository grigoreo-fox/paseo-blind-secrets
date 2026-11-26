import type { PluginClientContext } from "@getpaseo/plugin/client";
import { RulesSettings } from "./client/RulesSettings";
import { messages } from "./client/messages";
import { SecretCard } from "./client/SecretCard";
import { secretRowData } from "./shared/contracts";

export default function contribute(client: PluginClientContext) {
  client.addTimelineRenderer({
    kind: "secret-request",
    version: 1,
    schema: secretRowData,
    Component: SecretCard,
  });
  client.addSettingsScreen({
    id: "rules",
    title: messages.message("rulesTitle"),
    icon: "ScrollText",
    Component: RulesSettings,
  });
  return () => {};
}
