import type { SecretRowData } from "../shared/contracts";

export type Outcome = { kind: "submitted" } | { kind: "rejected" } | { kind: "expired" };

type Status = SecretRowData["status"];

interface Entry {
  agentId: string;
  data: SecretRowData;
  settle: (outcome: Outcome) => void;
  claimed: boolean;
  expireOnRelease: boolean;
}

export interface Registry {
  open(input: { agentId: string; data: SecretRowData; signal?: AbortSignal }): {
    id: string;
    outcome: Promise<Outcome>;
  };
  get(id: string): SecretRowData | undefined;
  listForAgent(agentId: string): SecretRowData[];
  settle(id: string, outcome: Outcome, options?: { claimed?: boolean }): boolean;
  claim(id: string): boolean;
  release(id: string): void;
  onChange(listener: (id: string, status: Status) => void): () => void;
  dispose(): void;
}

const STATUS: Record<Outcome["kind"], Status> = {
  submitted: "done",
  rejected: "rejected",
  expired: "expired",
};

export function createRegistry(options: { timeoutMs?: number } = {}): Registry {
  const timeoutMs = options.timeoutMs ?? 600_000;
  const entries = new Map<string, Entry>();
  const listeners = new Set<(id: string, status: Status) => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function settle(id: string, outcome: Outcome, options?: { claimed?: boolean }): boolean {
    const entry = entries.get(id);
    if (!entry) return false;
    if (entry.claimed && !options?.claimed) return false;
    entries.delete(id);
    entry.settle(outcome);
    for (const listener of listeners) listener(id, STATUS[outcome.kind]);
    return true;
  }

  function expire(id: string): void {
    const entry = entries.get(id);
    if (!entry) return;
    if (entry.claimed) entry.expireOnRelease = true;
    else settle(id, { kind: "expired" });
  }

  return {
    open({ agentId, data, signal }) {
      const id = data.requestId;
      const outcome = new Promise<Outcome>((resolve) => {
        const timer = setTimeout(() => expire(id), timeoutMs);
        timers.add(timer);
        entries.set(id, {
          agentId,
          data,
          claimed: false,
          expireOnRelease: false,
          settle: (value) => {
            clearTimeout(timer);
            timers.delete(timer);
            resolve(value);
          },
        });
      });
      if (signal?.aborted) expire(id);
      else signal?.addEventListener("abort", () => expire(id), { once: true });
      return { id, outcome };
    },
    get: (id) => entries.get(id)?.data,
    listForAgent: (agentId) =>
      [...entries.values()].filter((e) => e.agentId === agentId).map((e) => e.data),
    settle,
    claim(id) {
      const entry = entries.get(id);
      if (!entry || entry.claimed) return false;
      entry.claimed = true;
      return true;
    },
    release(id) {
      const entry = entries.get(id);
      if (!entry) return;
      entry.claimed = false;
      if (entry.expireOnRelease) settle(id, { kind: "expired" });
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const id of [...entries.keys()]) settle(id, { kind: "expired" }, { claimed: true });
    },
  };
}
