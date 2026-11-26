import { chmod, mkdtemp, stat, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_SECRET_BYTES, readSecret, writeSecret } from "../server/files";

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

  it("reads a file of exactly the size limit", async () => {
    const file = join(await tmp(), "big-ok");
    await writeFile(file, "a".repeat(MAX_SECRET_BYTES));
    expect((await readSecret(file)).length).toBe(MAX_SECRET_BYTES);
  });

  it("rejects a file over the size limit without reading it and without leaking content", async () => {
    const file = join(await tmp(), "big");
    await writeFile(file, "S3CR3T".repeat(MAX_SECRET_BYTES));
    const error = await readSecret(file).then(
      () => null,
      (e: Error) => e,
    );
    expect(error?.message).toBe(`too large: ${file}`);
  });

  it("rejects a binary file that contains a NUL byte", async () => {
    const file = join(await tmp(), "bin");
    await writeFile(file, Buffer.from([0x61, 0x00, 0x62]));
    await expect(readSecret(file)).rejects.toThrow(`not text: ${file}`);
  });

  it("rejects bytes that are not valid UTF-8", async () => {
    const file = join(await tmp(), "latin");
    await writeFile(file, Buffer.from([0xff, 0xfe, 0x41]));
    await expect(readSecret(file)).rejects.toThrow(`not text: ${file}`);
  });

  it("reads multi-byte UTF-8 text", async () => {
    const file = join(await tmp(), "utf8");
    await writeSecret(file, "пароль-密码");
    expect(await readSecret(file)).toBe("пароль-密码");
  });
});
