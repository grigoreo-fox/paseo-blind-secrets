import { useSettings, useTranslation, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Text, TextInput } from "react-native";
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
  const report = (ok: boolean) => setNote(ok ? t("rulesSaved") : t("rulesSaveFailed"));

  return (
    <SettingsSection title={t("rulesTitle")}>
      <SettingsCard>
        <SettingsSwitch
          label={t("rulesEnabled")}
          hint={t("rulesHint")}
          value={values.enabled}
          disabled={settings.saving}
          onValueChange={async (enabled) => report(await settings.save({ ...values, enabled }, revision))}
        />
        <SettingsRow label={t("rulesEditor")}>
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
            style={[styles.input, styles.multiInput]}
          />
          {note ? <Text style={styles.muted}>{note}</Text> : null}
        </SettingsRow>
        <SettingsAction
          label={t("rulesSave")}
          actionLabel={t("rulesSave")}
          disabled={!dirty || settings.saving}
          onPress={async () => report(await settings.save({ ...values, text }, revision))}
        />
        <SettingsAction
          label={t("rulesReset")}
          actionLabel={t("rulesReset")}
          disabled={settings.saving || text === DEFAULT_RULES}
          onPress={async () => {
            const ok = await settings.reset();
            if (ok) setDraft(DEFAULT_RULES);
            report(ok);
          }}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
