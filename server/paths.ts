import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function resolveSecretPath(cwd: string, input: string, home: string = homedir()): string {
  if (input === "~") return home;
  if (input.startsWith("~/")) return resolve(join(home, input.slice(2)));
  return resolve(cwd, input);
}
