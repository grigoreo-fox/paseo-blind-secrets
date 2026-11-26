import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { notReadablePath } from "../client/errors";

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

describe("notReadablePath", () => {
  it("extracts the path from the daemon's not-readable error", () => {
    expect(notReadablePath("not readable: /work/g")).toBe("/work/g");
  });

  it("returns null for any other error text", () => {
    expect(notReadablePath("unknown_request")).toBeNull();
  });
});
