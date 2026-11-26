import { useSettings, useTranslation, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { DEFAULT_RULES, rulesSettings } from "../shared/rules";
import { messages } from "./messages";
import { useStyles } from "./styles";

export function RulesSettings({ theme, layout }: PluginSurfaceProps) {
  const { t } = useTranslation(messages);
  const styles = useStyles(theme, layout);
  const settings = useSettings(rulesSettings);
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const saved = settings.status === "ready" ? settings.values.text : null;
  useEffect(() => {
    if (saved !== null && draft === null) setDraft(saved);
  }, [saved, draft]);

  if (settings.status === "loading") return <Text style={styles.muted}>{t("rulesLoading")}</Text>;
  if (settings.status === "error") return <Text style={styles.error}>{settings.error}</Text>;
  if (settings.status === "invalid") {
    return (
      <SettingsSection title={t("rulesTitle")}>
        <SettingsCard>
          <SettingsRow label={t("rulesInvalid")}>
            <Text style={styles.muted}>{settings.error}</Text>
          </SettingsRow>
          <SettingsAction
            label={t("rulesReset")}
            actionLabel={t("rulesReset")}
            onPress={async () => {
              if (await settings.reset()) setDraft(DEFAULT_RULES);
            }}
          />
        </SettingsCard>
      </SettingsSection>
    );
  }

  const { values, revision } = settings;
  const text = draft ?? values.text;
  const dirty = text !== values.text;
  const saveOff = !dirty || settings.saving;
  const resetOff = settings.saving || text === DEFAULT_RULES;
  const report = (ok: boolean) => setNote(ok ? t("rulesSaved") : t("rulesSaveFailed"));

  return (
    <SettingsSection title={t("rulesTitle")}>
      <View style={styles.cards}>
        <SettingsCard>
          <SettingsSwitch
            label={t("rulesEnabled")}
            hint={t("rulesHint")}
            value={values.enabled}
            disabled={settings.saving}
            onValueChange={async (enabled) => report(await settings.save({ ...values, enabled }, revision))}
          />
        </SettingsCard>
        <SettingsCard>
          <View style={styles.rulesPanel}>
            <Text style={styles.muted}>{t("rulesEditor")}</Text>
            <TextInput
              value={text}
              onChangeText={(next) => {
                setDraft(next);
                setNote("");
              }}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              style={[styles.input, styles.rulesInput]}
            />
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("rulesReset")}
                disabled={resetOff}
                onPress={async () => {
                  const ok = await settings.reset();
                  if (ok) setDraft(DEFAULT_RULES);
                  report(ok);
                }}
                style={[styles.button, resetOff && styles.buttonOff]}
              >
                <Text style={styles.label}>{t("rulesReset")}</Text>
              </Pressable>
              <Text style={styles.note}>{note}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("rulesSave")}
                disabled={saveOff}
                onPress={async () => report(await settings.save({ ...values, text }, revision))}
                style={[styles.button, styles.buttonPrimary, saveOff && styles.buttonOff]}
              >
                <Text style={styles.primaryText}>{t("rulesSave")}</Text>
              </Pressable>
            </View>
          </View>
        </SettingsCard>
      </View>
    </SettingsSection>
  );
}
