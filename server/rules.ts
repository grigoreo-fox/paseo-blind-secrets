export interface RulesValues {
  enabled: boolean;
  text: string;
}

export function applyRules<Config extends object>(config: Config, rules: RulesValues): Config | undefined {
  const text = rules.text.trim();
  if (!rules.enabled || !text) return undefined;
  const existing = (config as { systemPrompt?: string }).systemPrompt ?? "";
  if (existing.includes(text)) return undefined;
  return { ...config, systemPrompt: existing ? `${existing}\n\n${text}` : text };
}
