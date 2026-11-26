import { chmod, mkdtemp, stat, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSecret, writeSecret } from "../server/files";

async function tmp() {
  return mkdtemp(join(tmpdir(), "blind-secrets-"));
}

describe("secret files", () => {
  it("creates nested directories and stores the bytes exactly", async () => {
    const file = join(await tmp(), "a", "b", "token");
    await writeSecret(file, "  a\n");
    expect(await readFile(file, "utf8")).toBe("  a\n");
  });

  it("writes with mode 0600", async () => {
    const file = join(await tmp(), "token");
    await writeSecret(file, "x");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("overwrites an existing file and resets its mode to 0600", async () => {
    const file = join(await tmp(), "token");
    await writeFile(file, "old-long-value");
    await chmod(file, 0o644);
    await writeSecret(file, "new");
    expect(await readFile(file, "utf8")).toBe("new");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("reads the value without trimming", async () => {
    const file = join(await tmp(), "token");
    await writeSecret(file, " v \n");
    expect(await readSecret(file)).toBe(" v \n");
  });

  it("rejects a missing file with a message that names the path only", async () => {
    const file = join(await tmp(), "missing");
    await expect(readSecret(file)).rejects.toThrow(`not readable: ${file}`);
  });
});
