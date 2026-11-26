import { useRpc, useTranslation } from "@getpaseo/plugin/client";
import { copyText, Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { parseSecretError } from "./errors";
import { blindEyeSvg } from "./icons";
import { maskValue } from "./mask";
import { messages } from "./messages";
import { MultilineField, MultilineView } from "./multiline";
import { isMultiline } from "./summary";
import { useStyles, type Layout, type Theme } from "./styles";
import { checkFormat } from "../shared/format";
import {
  secretsRead,
  secretsReject,
  secretsSubmit,
  type SecretRowData,
} from "../shared/contracts";

interface Props {
  data: SecretRowData;
  theme: Theme;
  layout: Layout;
  expired?: boolean;
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
  const describe = (message: string) => {
    const parsed = parseSecretError(message);
    return t(parsed ? parsed.key : "requestFailed", { path: parsed?.path ?? "" });
  };
  const formatError = (item: SecretRowData["items"][number]): string | null => {
    const wrong = checkFormat(values[item.label] ?? "", item.format ?? "any");
    return wrong ? t(wrong === "invalid_pem" ? "invalidPem" : "invalidJson") : null;
  };
  const ready = data.items.every((item) => (values[item.label] ?? "") !== "" && formatError(item) === null);

  useEffect(() => () => setValues({}), []);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setValues({});
    } catch (e) {
      setError(e instanceof Error ? describe(e.message) : t("requestFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <Icon icon={{ svg: blindEyeSvg }} size={20} color={theme.colors.foreground} />
        <Text style={styles.title}>{t("getTitle")}</Text>
      </View>
      <Text style={styles.muted}>{t("getHint")}</Text>
      {data.items.map((item) => (
        <View key={item.label} style={{ gap: 4 }}>
          <Text style={styles.label}>{item.label}</Text>
          {item.description ? <Text style={styles.muted}>{item.description}</Text> : null}
          {isMultiline(item) ? (
            <MultilineField
              value={values[item.label] ?? ""}
              onChange={(text) => setValues((prev) => ({ ...prev, [item.label]: text }))}
              format={item.format}
              label={item.label}
              error={formatError(item)}
              theme={theme}
              layout={layout}
            />
          ) : (
            <TextInput
              value={values[item.label] ?? ""}
              onChangeText={(text) => setValues((prev) => ({ ...prev, [item.label]: text }))}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              placeholder={t("valuePlaceholder")}
              placeholderTextColor={theme.colors.foregroundMuted}
              style={styles.input}
            />
          )}
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
  const describe = (message: string) => {
    const parsed = parseSecretError(message);
    return t(parsed ? parsed.key : "requestFailed", { path: parsed?.path ?? "" });
  };

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
      <View style={styles.header}>
        <Icon icon={{ svg: blindEyeSvg }} size={20} color={theme.colors.foreground} />
        <Text style={styles.title}>{t("showTitle")}</Text>
      </View>
      <Text style={styles.muted}>{t("showHint")}</Text>
      {(items ?? []).map((item) => {
        const shown = revealed[item.label] === true;
        const text = item.value ?? "";
        return (
          <View key={item.label} style={{ gap: 4 }}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.muted}>{data.items.find((i) => i.label === item.label)?.resolvedPath}</Text>
            {item.error ? (
              <Text style={styles.error}>{describe(item.error)}</Text>
            ) : (
              <>
                {text.includes("\n") ? (
                  <MultilineView
                    value={text}
                    label={item.label}
                    revealed={shown}
                    onToggle={() => setRevealed((prev) => ({ ...prev, [item.label]: !shown }))}
                    theme={theme}
                    layout={layout}
                  />
                ) : (
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
                      <Icon name={shown ? "EyeOff" : "Eye"} size={18} color={theme.colors.foregroundMuted} />
                    </Pressable>
                  </View>
                )}
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
