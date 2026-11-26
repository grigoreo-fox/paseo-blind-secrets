import { detectFormat, summarize, type SecretFormat, type Summary } from "../shared/format";

export type ValueKind = "pem" | "json" | "text";

export function isMultiline(item: { multiline?: boolean; format?: SecretFormat }): boolean {
  return item.multiline === true || item.format === "pem" || item.format === "json";
}

export function describeValue(
  value: string,
  format?: SecretFormat,
): { kind: ValueKind; lines: number; size: Summary["size"] } {
  const detected = format && format !== "any" ? format : detectFormat(value);
  const { lines, size } = summarize(value);
  return { kind: detected === "any" ? "text" : detected, lines, size };
}
