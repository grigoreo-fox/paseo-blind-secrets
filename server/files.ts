import { randomBytes } from "node:crypto";
import { access, constants, lstat, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export const MAX_SECRET_BYTES = 64 * 1024;

export interface Staged {
  commit(): Promise<void>;
  discard(): Promise<void>;
}

export async function stageSecret(absPath: string, value: string): Promise<Staged> {
  const dir = dirname(absPath);
  const temp = join(dir, `.${basename(absPath)}.${randomBytes(6).toString("hex")}.tmp`);
  const discard = () => rm(temp, { force: true }).catch(() => undefined);
  try {
    const existing = await lstat(absPath).catch(() => null);
    if (existing?.isDirectory()) throw new Error("target is a directory");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.writeFile(value, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    await discard();
    throw new Error(`write failed: ${absPath}`);
  }
  return {
    discard,
    async commit() {
      try {
        await rename(temp, absPath);
      } catch {
        await discard();
        throw new Error(`write failed: ${absPath}`);
      }
    },
  };
}

export async function checkWritable(absPath: string): Promise<void> {
  const existing = await lstat(absPath).catch(() => null);
  if (existing?.isDirectory()) throw new Error(`is a directory: ${absPath}`);
  let dir = dirname(absPath);
  for (;;) {
    let info;
    try {
      info = await stat(dir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOTDIR") throw new Error(`parent is not a directory: ${absPath}`);
      const up = dirname(dir);
      if (code !== "ENOENT" || up === dir) throw new Error(`not writable: ${absPath}`);
      dir = up;
      continue;
    }
    if (!info.isDirectory()) throw new Error(`parent is not a directory: ${absPath}`);
    try {
      await access(dir, constants.W_OK | constants.X_OK);
    } catch {
      throw new Error(`not writable: ${absPath}`);
    }
    return;
  }
}

export async function writeSecret(absPath: string, value: string): Promise<void> {
  await (await stageSecret(absPath, value)).commit();
}

export async function readSecret(absPath: string): Promise<string> {
  let bytes: Buffer;
  try {
    const info = await stat(absPath);
    if (!info.isFile()) throw new Error("not a file");
    if (info.size > MAX_SECRET_BYTES) throw new Error(`too large: ${absPath}`);
    bytes = await readFile(absPath);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("too large: ")) throw error;
    throw new Error(`not readable: ${absPath}`);
  }
  if (bytes.length > MAX_SECRET_BYTES) throw new Error(`too large: ${absPath}`);
  if (bytes.includes(0)) throw new Error(`not text: ${absPath}`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`not text: ${absPath}`);
  }
}
