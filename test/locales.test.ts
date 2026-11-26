import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSecretError } from "../client/errors";

const dir = join(__dirname, "..", "client", "locales");
const LANGUAGES = ["ar", "en", "es", "fr", "ja", "ko", "pt-BR", "ru", "zh-CN"];

function load(code: string): Record<string, string> {
  return JSON.parse(readFileSync(join(dir, `${code}.json`), "utf8"));
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe("locales", () => {
  it("has exactly the languages Paseo supports", () => {
    const files = readdirSync(dir).map((f) => f.replace(/\.json$/, "")).sort();
    expect(files).toEqual([...LANGUAGES].sort());
  });

  const en = () => load("en");

  for (const code of LANGUAGES.filter((c) => c !== "en")) {
    it(`${code} has every English key and no others`, () => {
      expect(Object.keys(load(code)).sort()).toEqual(Object.keys(en()).sort());
    });

    it(`${code} keeps the English placeholders and no empty text`, () => {
      const locale = load(code);
      for (const [key, text] of Object.entries(en())) {
        expect(locale[key].trim(), `${code}.${key} is empty`).not.toBe("");
        expect(placeholders(locale[key]), `${code}.${key}`).toEqual(placeholders(text));
      }
    });
  }
});

describe("parseSecretError", () => {
  it("maps the daemon's file errors to a translation key and the path", () => {
    expect(parseSecretError("not readable: /work/g")).toEqual({ key: "notReadable", path: "/work/g" });
    expect(parseSecretError("not text: /work/b")).toEqual({ key: "notText", path: "/work/b" });
    expect(parseSecretError("too large: /work/c")).toEqual({ key: "tooLarge", path: "/work/c" });
  });

  it("maps a failed write with the path", () => {
    expect(parseSecretError("write failed: /work/a")).toEqual({ key: "writeFailed", path: "/work/a" });
  });

  it("maps the value size error and stale requests without a path", () => {
    expect(parseSecretError("value_too_large")).toEqual({ key: "valueTooLarge" });
    expect(parseSecretError("unknown_request")).toEqual({ key: "requestGone" });
    expect(parseSecretError("request_busy")).toEqual({ key: "requestGone" });
  });

  it("sees through the daemon's Request failed wrapper", () => {
    expect(parseSecretError("Request failed: write failed: /work/a")).toEqual({
      key: "writeFailed",
      path: "/work/a",
    });
    expect(parseSecretError("Request failed: value_too_large")).toEqual({ key: "valueTooLarge" });
    expect(parseSecretError("Request failed: unknown_request")).toEqual({ key: "requestGone" });
  });

  it("returns null for any other error text", () => {
    expect(parseSecretError("EACCES: permission denied, open '/x'")).toBeNull();
    expect(parseSecretError("unknown_label")).toBeNull();
  });

  it("only uses keys that exist in the English file", () => {
    const keys = Object.keys(load("en"));
    for (const message of [
      "not readable: p",
      "not text: p",
      "too large: p",
      "write failed: p",
      "value_too_large",
      "unknown_request",
    ]) {
      expect(keys).toContain(parseSecretError(message)!.key);
    }
  });
});
