export type SecretFormat = "any" | "json" | "pem";
export type FormatError = "invalid_json" | "invalid_pem";

const PEM_BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----\r?\n([\s\S]*?)\r?\n?-----END \1-----/g;

function pemOk(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  let rest = text;
  let blocks = 0;
  for (const match of text.matchAll(PEM_BLOCK)) {
    if (!match[2].trim()) return false;
    rest = rest.replace(match[0], "");
    blocks++;
  }
  return blocks > 0 && rest.trim() === "";
}

function jsonOk(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function checkFormat(value: string, format: SecretFormat): FormatError | null {
  if (format === "pem") return pemOk(value) ? null : "invalid_pem";
  if (format === "json") return jsonOk(value) ? null : "invalid_json";
  return null;
}

export function detectFormat(value: string): SecretFormat {
  if (pemOk(value)) return "pem";
  const text = value.trim();
  if ((text.startsWith("{") || text.startsWith("[")) && jsonOk(text)) return "json";
  return "any";
}

export interface Summary {
  lines: number;
  bytes: number;
  size: { unit: "B" | "KiB"; value: string };
}

export function summarize(value: string): Summary {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\n$/, "");
  const bytes = new TextEncoder().encode(value).length;
  const size =
    bytes < 1024
      ? { unit: "B" as const, value: String(bytes) }
      : { unit: "KiB" as const, value: String(Math.round((bytes / 1024) * 10) / 10) };
  return { lines: normalized === "" ? 0 : normalized.split("\n").length, bytes, size };
}
