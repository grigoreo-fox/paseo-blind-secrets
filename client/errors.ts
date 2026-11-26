export type SecretErrorKey = "notReadable" | "notText" | "tooLarge" | "valueTooLarge";

export interface ParsedSecretError {
  key: SecretErrorKey;
  path?: string;
}

const PATH_ERRORS: ReadonlyArray<readonly [string, SecretErrorKey]> = [
  ["not readable: ", "notReadable"],
  ["not text: ", "notText"],
  ["too large: ", "tooLarge"],
];

export function parseSecretError(message: string): ParsedSecretError | null {
  for (const [prefix, key] of PATH_ERRORS) {
    if (message.startsWith(prefix)) return { key, path: message.slice(prefix.length) };
  }
  return message === "value_too_large" ? { key: "valueTooLarge" } : null;
}
