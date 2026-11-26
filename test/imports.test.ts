import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const ROOTS = ["index.server.ts", "index.client.tsx", "server", "client", "shared"];
const HOST_PROVIDED = new Set([
  "zod",
  "react",
  "react/jsx-runtime",
  "react-native",
  "@tanstack/react-query",
  "@getpaseo/plugin",
  "@getpaseo/plugin/client",
  "@getpaseo/plugin/client/ui",
  "@getpaseo/plugin/server",
]);

function sources(path: string): string[] {
  const full = join(root, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => sources(join(path, name)));
}

function specifiers(code: string): string[] {
  const found = [...code.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)];
  return found.map((m) => m[1]);
}

describe("plugin sources only import what a clean checkout can resolve", () => {
  const files = ROOTS.flatMap(sources).filter((f) => /\.(ts|tsx)$/.test(f));

  it("scans the runtime sources", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  for (const file of files) {
    it(`${relative(root, file)}`, () => {
      for (const spec of specifiers(readFileSync(file, "utf8"))) {
        const ok = spec.startsWith(".") || spec.startsWith("node:") || HOST_PROVIDED.has(spec);
        expect(ok, `"${spec}" is not relative, node: or host-provided`).toBe(true);
      }
    });
  }
});
