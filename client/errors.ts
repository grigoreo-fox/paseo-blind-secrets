const PREFIX = "not readable: ";

export function notReadablePath(error: string): string | null {
  return error.startsWith(PREFIX) ? error.slice(PREFIX.length) : null;
}
