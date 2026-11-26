import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeSecret(absPath: string, value: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, value, { encoding: "utf8", mode: 0o600 });
  await chmod(absPath, 0o600);
}

export async function readSecret(absPath: string): Promise<string> {
  try {
    return await readFile(absPath, "utf8");
  } catch {
    throw new Error(`not readable: ${absPath}`);
  }
}
