import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SpikeCard } from "./client/spike";
import { spikeRowData } from "./shared/spike";

export default function contribute(client: PluginClientContext) {
  client.addTimelineRenderer({
    kind: "spike",
    version: 1,
    schema: spikeRowData,
    Component: SpikeCard,
  });
  return () => {};
}
