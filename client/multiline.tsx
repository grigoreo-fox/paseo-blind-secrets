import { useTranslation } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { messages } from "./messages";
import { useStyles, type Layout, type Theme } from "./styles";
import { describeValue, type ValueKind } from "./summary";
import type { SecretFormat } from "../shared/format";

interface Look {
  theme: Theme;
  layout: Layout;
}

const KIND = { pem: "kindPem", json: "kindJson", text: "kindText" } as const satisfies Record<ValueKind, string>;

function useSummaryText(value: string, format?: SecretFormat): string {
  const { t } = useTranslation(messages);
  const { kind, lines, size } = describeValue(value, format);
  const sizeText = size.unit === "B" ? t("sizeB", { n: size.value }) : t("sizeKib", { n: size.value });
  return t("summary", { kind: t(KIND[kind]), lines, size: sizeText });
}

function Eye({ shown, label, onPress, theme, layout }: Look & { shown: boolean; label: string; onPress: () => void }) {
  const styles = useStyles(theme, layout);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={styles.eye} onPress={onPress}>
      <Icon name={shown ? "EyeOff" : "Eye"} size={18} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

function Block({ value, theme, layout }: Look & { value: string }) {
  const styles = useStyles(theme, layout);
  return (
    <ScrollView style={styles.block} nestedScrollEnabled>
      <Text selectable style={[styles.label, styles.mono]}>
        {value}
      </Text>
    </ScrollView>
  );
}

/** A collapsed one-line summary of a multi-line value, with an eye that opens it in a scrollable block. */
export function MultilineView({
  value,
  format,
  label,
  revealed,
  onToggle,
  theme,
  layout,
}: Look & { value: string; format?: SecretFormat; label: string; revealed: boolean; onToggle: () => void }) {
  const styles = useStyles(theme, layout);
  const { t } = useTranslation(messages);
  const summary = useSummaryText(value, format);
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.valueBox}>
        <Text style={styles.label}>{summary}</Text>
        <Eye
          shown={revealed}
          label={t(revealed ? "hide" : "reveal", { label })}
          onPress={onToggle}
          theme={theme}
          layout={layout}
        />
      </View>
      {revealed ? <Block value={value} theme={theme} layout={layout} /> : null}
    </View>
  );
}

/** Multi-line entry: visible while you paste, then folded into a summary once you leave the field. */
export function MultilineField({
  value,
  onChange,
  format,
  label,
  error,
  theme,
  layout,
}: Look & {
  value: string;
  onChange: (value: string) => void;
  format?: SecretFormat;
  label: string;
  error: string | null;
}) {
  const styles = useStyles(theme, layout);
  const { t } = useTranslation(messages);
  const [editing, setEditing] = useState(true);
  const [revealed, setRevealed] = useState(false);

  if (editing || value === "") {
    return (
      <TextInput
        value={value}
        onChangeText={onChange}
        onBlur={() => value !== "" && setEditing(false)}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        placeholder={t("multilinePlaceholder")}
        placeholderTextColor={theme.colors.foregroundMuted}
        style={[styles.input, styles.multiInput, styles.mono]}
      />
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <MultilineView
        value={value}
        format={format}
        label={label}
        revealed={revealed}
        onToggle={() => setRevealed((shown) => !shown)}
        theme={theme}
        layout={layout}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("edit")}
        style={styles.small}
        onPress={() => {
          setRevealed(false);
          setEditing(true);
        }}
      >
        <Text style={styles.secondaryText}>{t("edit")}</Text>
      </Pressable>
    </View>
  );
}
