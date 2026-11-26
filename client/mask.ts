export function maskValue(value: string, revealed: boolean): string {
  if (value === "" || revealed) return value;
  return "••••••••";
}
