import { useRpc, type PluginHostProps } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { maskValue } from "./mask";
import {
  secretsRead,
  secretsReject,
  secretsSubmit,
  type SecretRowData,
} from "../shared/contracts";

type Theme = PluginHostProps["theme"];
type Layout = PluginHostProps["layout"];

interface Props {
  data: SecretRowData;
  theme: Theme;
  layout: Layout;
  expired?: boolean;
}

function useStyles(theme: Theme, layout: Layout) {
  return useMemo(
    () => ({
      box: { gap: layout.compact ? 8 : 12 },
      title: { color: theme.colors.foreground, fontWeight: "600" as const },
      muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
      label: { color: theme.colors.foreground },
      error: { color: theme.colors.foregroundMuted },
      input: {
        color: theme.colors.foreground,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 10,
      },
      row: { flexDirection: "row" as const, gap: 8 },
      primary: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
      },
      primaryOff: { opacity: 0.4 },
      primaryText: { color: theme.colors.accentForeground, textAlign: "center" as const },
      secondary: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      secondaryText: { color: theme.colors.foreground, textAlign: "center" as const },
    }),
    [theme, layout.compact],
  );
}

function Summary({ data, theme, layout, expired }: Props) {
  const styles = useStyles(theme, layout);
  const paths = data.items.map((i) => i.resolvedPath).join(", ");
  const status = expired ? "expired" : data.status;
  const text = {
    done: data.kind === "get" ? `Secrets written: ${paths}` : "Secrets shown and closed",
    rejected: "You declined this request",
    expired: "This request expired",
    pending: "",
  }[status];
  return <Text style={styles.muted}>{text}</Text>;
}

function GetForm({ data, theme, layout }: Props) {
  const styles = useStyles(theme, layout);
  const submit = useRpc(secretsSubmit);
  const reject = useRpc(secretsReject);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = data.items.every((item) => (values[item.label] ?? "") !== "");

  useEffect(() => () => setValues({}), []);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setValues({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>
        The agent asks for {data.items.length === 1 ? "a secret" : "secrets"}
      </Text>
      <Text style={styles.muted}>
        The values go straight to the files. The agent does not see them.
      </Text>
      {data.items.map((item) => (
        <View key={item.label} style={{ gap: 4 }}>
          <Text style={styles.label}>{item.label}</Text>
          {item.description ? <Text style={styles.muted}>{item.description}</Text> : null}
          <TextInput
            value={values[item.label] ?? ""}
            onChangeText={(text) => setValues((prev) => ({ ...prev, [item.label]: text }))}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Secret value"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
          />
          <Text style={styles.muted}>Writes to {item.resolvedPath} (overwrites if it exists)</Text>
        </View>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Write secrets"
          disabled={!ready || busy}
          style={[styles.primary, !ready || busy ? styles.primaryOff : null]}
          onPress={() => run(() => submit({ requestId: data.requestId, values }))}
        >
          <Text style={styles.primaryText}>Write</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reject request"
          disabled={busy}
          style={styles.secondary}
          onPress={() => run(() => reject({ requestId: data.requestId }))}
        >
          <Text style={styles.secondaryText}>Reject</Text>
        </Pressable>
      </View>
    </View>
  );
}

type Shown = { label: string; value?: string; error?: string };

function ShowForm({ data, theme, layout }: Props) {
  const styles = useStyles(theme, layout);
  const read = useRpc(secretsRead);
  const submit = useRpc(secretsSubmit);
  const [items, setItems] = useState<Shown[] | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    read({ requestId: data.requestId }).then(
      (result) => live && setItems(result.items),
      (e: unknown) =>
        live && setNote(e instanceof Error ? e.message : "Could not read the secrets"),
    );
    return () => {
      live = false;
      setItems(null);
    };
  }, [data.requestId]);

  return (
    <View style={styles.box}>
      <Text style={styles.title}>
        The agent shows {data.items.length === 1 ? "a secret" : "secrets"}
      </Text>
      <Text style={styles.muted}>Only you see the values. The agent does not.</Text>
      {(items ?? []).map((item) => {
        const shown = revealed[item.label] === true;
        const text = item.value ?? "";
        return (
          <View key={item.label} style={{ gap: 4 }}>
            <Text style={styles.label}>{item.label}</Text>
            {item.error ? (
              <Text style={styles.error}>{item.error}</Text>
            ) : (
              <>
                <View style={styles.input}>
                  <Text selectable={shown} style={styles.label}>
                    {maskValue(text, shown) || " "}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${shown ? "Hide" : "Show"} ${item.label}`}
                    style={styles.secondary}
                    onPress={() => setRevealed((prev) => ({ ...prev, [item.label]: !shown }))}
                  >
                    <Text style={styles.secondaryText}>{shown ? "Hide" : "Show"}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Copy ${item.label}`}
                    style={styles.primary}
                    onPress={() =>
                      copyText(text).then(
                        () => setNote(`Copied ${item.label}`),
                        () => setNote("Copy failed"),
                      )
                    }
                  >
                    <Text style={styles.primaryText}>Copy</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        );
      })}
      {note ? <Text style={styles.muted}>{note}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={styles.secondary}
        onPress={() => submit({ requestId: data.requestId, values: {} }).catch(() => undefined)}
      >
        <Text style={styles.secondaryText}>Close</Text>
      </Pressable>
    </View>
  );
}

export function SecretForm(props: Props) {
  if (props.data.status !== "pending" || props.expired) return <Summary {...props} />;
  return props.data.kind === "get" ? <GetForm {...props} /> : <ShowForm {...props} />;
}
