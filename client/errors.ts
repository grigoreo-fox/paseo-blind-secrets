export type SecretErrorKey =
  | "notReadable"
  | "notText"
  | "tooLarge"
  | "writeFailed"
  | "valueTooLarge"
  | "requestGone";

export interface ParsedSecretError {
  key: SecretErrorKey;
  path?: string;
}

const PATH_ERRORS: ReadonlyArray<readonly [string, SecretErrorKey]> = [
  ["not readable: ", "notReadable"],
  ["not text: ", "notText"],
  ["too large: ", "tooLarge"],
  ["write failed: ", "writeFailed"],
];

const CODE_ERRORS: Readonly<Record<string, SecretErrorKey>> = {
  value_too_large: "valueTooLarge",
  unknown_request: "requestGone",
  request_busy: "requestGone",
};

const DAEMON_PREFIX = /^Request failed:\s*/;
const DAEMON_SUFFIX = /\s+requestType=\S+(?:\s+code=\S+)?\s*$/;

export function parseSecretError(raw: string): ParsedSecretError | null {
  const message = raw.replace(DAEMON_PREFIX, "").replace(DAEMON_SUFFIX, "");
  for (const [prefix, key] of PATH_ERRORS) {
    if (message.startsWith(prefix)) return { key, path: message.slice(prefix.length) };
  }
  const key = CODE_ERRORS[message];
  return key ? { key } : null;
}
