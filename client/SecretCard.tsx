import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { secretsPending, type SecretRowData } from "../shared/contracts";
import { SecretForm } from "./SecretForm";

export function SecretCard({
  agentId,
  item,
  theme,
  layout,
}: PluginTimelineItemProps<SecretRowData>) {
  const data = item.data;
  const pending = useRpc(secretsPending);
  const live = useQuery({
    queryKey: ["blind-secrets", "pending", agentId],
    queryFn: () => pending({ agentId }),
    enabled: data.status === "pending",
    refetchInterval: 3000,
  });
  const expired =
    data.status === "pending" &&
    live.data !== undefined &&
    !live.data.requests.some((r) => r.requestId === data.requestId);
  return (
    <View
      style={{
        padding: layout.compact ? 12 : 16,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <SecretForm data={data} theme={theme} layout={layout} expired={expired} />
    </View>
  );
}
