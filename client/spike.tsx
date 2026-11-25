import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { spikeDone, spikeRowData } from "../shared/spike";
import type { z } from "zod";

type Data = z.output<typeof spikeRowData>;

export function SpikeCard({ item, theme, layout }: PluginTimelineItemProps<Data>) {
  const done = useRpc(spikeDone);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const styles = useMemo(
    () => ({
      box: {
        padding: layout.compact ? 12 : 16,
        gap: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      text: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted },
      input: {
        color: theme.colors.foreground,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 10,
      },
      button: { padding: 12, borderRadius: 8, backgroundColor: theme.colors.accent },
      buttonText: { color: theme.colors.accentForeground, textAlign: "center" as const },
    }),
    [theme, layout.compact],
  );
  if (item.data.status === "done") {
    return (
      <View style={styles.box}>
        <Text style={styles.muted}>Spike request done</Text>
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <Text style={styles.text}>Spike: type a test value</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="value"
        placeholderTextColor={theme.colors.foregroundMuted}
        style={styles.input}
      />
      <Pressable
        accessibilityRole="button"
        style={styles.button}
        onPress={() => {
          copyText(value).then(
            () => setNote("copied"),
            (error: unknown) => setNote("copy failed: " + String(error)),
          );
        }}
      >
        <Text style={styles.buttonText}>Copy</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={styles.button}
        onPress={() => {
          done({ requestId: item.data.requestId, text: value }).catch((error: unknown) =>
            setNote("rpc failed: " + String(error)),
          );
          setValue("");
        }}
      >
        <Text style={styles.buttonText}>Send</Text>
      </Pressable>
      {note ? <Text style={styles.muted}>{note}</Text> : null}
    </View>
  );
}
