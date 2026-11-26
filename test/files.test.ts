import { chmod, lstat, mkdir, mkdtemp, readdir, stat, symlink, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkWritable, MAX_SECRET_BYTES, readSecret, stageSecret, writeSecret } from "../server/files";

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

  it("stages without touching the target until commit, and leaves no temp file after commit", async () => {
    const dir = await tmp();
    const file = join(dir, "token");
    await writeFile(file, "old");
    const staged = await stageSecret(file, "new");
    expect(await readFile(file, "utf8")).toBe("old");
    await staged.commit();
    expect(await readFile(file, "utf8")).toBe("new");
    expect(await readdir(dir)).toEqual(["token"]);
  });

  it("discard removes the staged file and keeps the target", async () => {
    const dir = await tmp();
    const file = join(dir, "token");
    await writeFile(file, "old");
    const staged = await stageSecret(file, "new");
    await staged.discard();
    expect(await readFile(file, "utf8")).toBe("old");
    expect(await readdir(dir)).toEqual(["token"]);
  });

  it("never exposes the new content under a wider mode of the old file", async () => {
    const dir = await tmp();
    const file = join(dir, "token");
    await writeFile(file, "old");
    await chmod(file, 0o644);
    const staged = await stageSecret(file, "new");
    const temp = (await readdir(dir)).find((n) => n !== "token")!;
    expect((await stat(join(dir, temp))).mode & 0o777).toBe(0o600);
    await staged.discard();
  });

  it("replaces a symlink instead of writing through it", async () => {
    const dir = await tmp();
    const target = join(dir, "target");
    const link = join(dir, "link");
    await writeFile(target, "keep");
    await symlink(target, link);
    await writeSecret(link, "new");
    expect((await lstat(link)).isSymbolicLink()).toBe(false);
    expect(await readFile(link, "utf8")).toBe("new");
    expect(await readFile(target, "utf8")).toBe("keep");
  });

  it("refuses to stage onto a directory, before anything is written", async () => {
    const dir = await tmp();
    const target = join(dir, "adir");
    await mkdir(target);
    await expect(stageSecret(target, "v")).rejects.toThrow(`write failed: ${target}`);
    expect(await readdir(dir)).toEqual(["adir"]);
  });

  it("refuses to stage when the parent is a file", async () => {
    const dir = await tmp();
    const parent = join(dir, "afile");
    await writeFile(parent, "x");
    await expect(stageSecret(join(parent, "token"), "v")).rejects.toThrow("write failed:");
    expect(await readdir(dir)).toEqual(["afile"]);
  });

  it("refuses a directory without opening it as a file", async () => {
    const dir = await tmp();
    await expect(readSecret(dir)).rejects.toThrow(`not readable: ${dir}`);
  });

  it("does not hang on a FIFO", async () => {
    const dir = await tmp();
    const fifo = join(dir, "pipe");
    const { execFileSync } = await import("node:child_process");
    execFileSync("mkfifo", [fifo]);
    await expect(readSecret(fifo)).rejects.toThrow(`not readable: ${fifo}`);
  });
});

describe("checkWritable", () => {
  it("accepts a new file whose parent folders do not exist yet, without creating them", async () => {
    const dir = await tmp();
    await expect(checkWritable(join(dir, "a", "b", "token"))).resolves.toBeUndefined();
    expect(await readdir(dir)).toEqual([]);
  });

  it("accepts an existing file", async () => {
    const dir = await tmp();
    const file = join(dir, "token");
    await writeFile(file, "old");
    await expect(checkWritable(file)).resolves.toBeUndefined();
  });

  it("refuses a directory target", async () => {
    const dir = await tmp();
    const target = join(dir, "adir");
    await mkdir(target);
    await expect(checkWritable(target)).rejects.toThrow(`is a directory: ${target}`);
  });

  it("refuses when a parent is a file", async () => {
    const dir = await tmp();
    const parent = join(dir, "afile");
    await writeFile(parent, "x");
    const target = join(parent, "sub", "token");
    await expect(checkWritable(target)).rejects.toThrow(`parent is not a directory: ${target}`);
  });

  it.skipIf(process.getuid?.() === 0)("refuses a folder the user cannot write to", async () => {
    const dir = await tmp();
    const locked = join(dir, "locked");
    await mkdir(locked);
    await chmod(locked, 0o500);
    const target = join(locked, "token");
    try {
      await expect(checkWritable(target)).rejects.toThrow(`not writable: ${target}`);
    } finally {
      await chmod(locked, 0o700);
    }
  });
});
