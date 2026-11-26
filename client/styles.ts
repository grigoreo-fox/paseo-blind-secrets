import type { PluginHostProps } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { Platform } from "react-native";

export type Theme = PluginHostProps["theme"];
export type Layout = PluginHostProps["layout"];

export function useStyles(theme: Theme, layout: Layout) {
  return useMemo(
    () => ({
      box: { gap: layout.compact ? 8 : 12 },
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
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
      mono: { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
      multiInput: { minHeight: 120, textAlignVertical: "top" as const },
      block: {
        maxHeight: 200,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 10,
      },
      small: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignSelf: "flex-start" as const,
      },
    }),
    [theme, layout.compact],
  );
}
