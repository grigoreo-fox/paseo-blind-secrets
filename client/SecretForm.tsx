import { useRpc, useTranslation, type PluginHostProps } from "@getpaseo/plugin/client";
import { copyText, Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { notReadablePath } from "./errors";
import { maskValue } from "./mask";
import { messages } from "./messages";
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
      valueBox: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        paddingVertical: 10,
        paddingStart: 10,
        paddingEnd: 44,
        minHeight: 42,
        justifyContent: "center" as const,
      },
      eye: {
        position: "absolute" as const,
        end: 0,
        top: 0,
        bottom: 0,
        width: 44,
        alignItems: "center" as const,
        justifyContent: "center" as const,
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
  const { t } = useTranslation(messages);
  const paths = data.items.map((i) => i.resolvedPath).join(", ");
  const status = expired ? "expired" : data.status;
  const text = {
    done: data.kind === "get" ? t("summaryWritten", { paths }) : t("summaryShown"),
    rejected: t("summaryRejected"),
    expired: t("summaryExpired"),
    pending: "",
  }[status];
  return <Text style={styles.muted}>{text}</Text>;
}

function GetForm({ data, theme, layout }: Props) {
  const styles = useStyles(theme, layout);
  const { t } = useTranslation(messages);
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
      setError(e instanceof Error ? e.message : t("requestFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t("getTitle")}</Text>
      <Text style={styles.muted}>{t("getHint")}</Text>
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
            placeholder={t("valuePlaceholder")}
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
          />
          <Text style={styles.muted}>{t("writesTo", { path: item.resolvedPath })}</Text>
        </View>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("write")}
          disabled={!ready || busy}
          style={[styles.primary, !ready || busy ? styles.primaryOff : null]}
          onPress={() => run(() => submit({ requestId: data.requestId, values }))}
        >
          <Text style={styles.primaryText}>{t("write")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("reject")}
          disabled={busy}
          style={styles.secondary}
          onPress={() => run(() => reject({ requestId: data.requestId }))}
        >
          <Text style={styles.secondaryText}>{t("reject")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type Shown = { label: string; value?: string; error?: string };

function ShowForm({ data, theme, layout }: Props) {
  const styles = useStyles(theme, layout);
  const { t } = useTranslation(messages);
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
        live && setNote(e instanceof Error ? e.message : t("readFailed")),
    );
    return () => {
      live = false;
      setItems(null);
    };
  }, [data.requestId]);

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t("showTitle")}</Text>
      <Text style={styles.muted}>{t("showHint")}</Text>
      {(items ?? []).map((item) => {
        const shown = revealed[item.label] === true;
        const text = item.value ?? "";
        return (
          <View key={item.label} style={{ gap: 4 }}>
            <Text style={styles.label}>{item.label}</Text>
            {item.error ? (
              <Text style={styles.error}>
                {notReadablePath(item.error) !== null
                  ? t("notReadable", { path: notReadablePath(item.error) ?? "" })
                  : item.error}
              </Text>
            ) : (
              <>
                <View style={styles.valueBox}>
                  <Text selectable={shown} style={styles.label}>
                    {maskValue(text, shown) || " "}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(shown ? "hide" : "reveal", { label: item.label })}
                    hitSlop={6}
                    style={styles.eye}
                    onPress={() => setRevealed((prev) => ({ ...prev, [item.label]: !shown }))}
                  >
                    <Icon
                      name={shown ? "EyeOff" : "Eye"}
                      size={18}
                      color={theme.colors.foregroundMuted}
                    />
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("copy")}
                  style={styles.primary}
                  onPress={() =>
                    copyText(text).then(
                      () => setNote(t("copied", { label: item.label })),
                      () => setNote(t("copyFailed")),
                    )
                  }
                >
                  <Text style={styles.primaryText}>{t("copy")}</Text>
                </Pressable>
              </>
            )}
          </View>
        );
      })}
      {note ? <Text style={styles.muted}>{note}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("close")}
        style={styles.secondary}
        onPress={() => submit({ requestId: data.requestId, values: {} }).catch(() => undefined)}
      >
        <Text style={styles.secondaryText}>{t("close")}</Text>
      </Pressable>
    </View>
  );
}

export function SecretForm(props: Props) {
  if (props.data.status !== "pending" || props.expired) return <Summary {...props} />;
  return props.data.kind === "get" ? <GetForm {...props} /> : <ShowForm {...props} />;
}
