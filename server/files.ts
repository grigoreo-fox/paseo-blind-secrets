import { chmod, mkdir, open, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const MAX_SECRET_BYTES = 64 * 1024;

export async function writeSecret(absPath: string, value: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, value, { encoding: "utf8", mode: 0o600 });
  await chmod(absPath, 0o600);
}

export async function readSecret(absPath: string): Promise<string> {
  let bytes: Buffer;
  try {
    const handle = await open(absPath, "r");
    try {
      const { size } = await handle.stat();
      if (size > MAX_SECRET_BYTES) throw new Error(`too large: ${absPath}`);
      bytes = Buffer.alloc(size);
      await handle.read(bytes, 0, size, 0);
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("too large: ")) throw error;
    throw new Error(`not readable: ${absPath}`);
  }
  if (bytes.includes(0)) throw new Error(`not text: ${absPath}`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`not text: ${absPath}`);
  }
}
