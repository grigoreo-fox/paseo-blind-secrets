import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { defineAgentTool } from "@getpaseo/plugin/server";

type Waiter = { resolve: (text: string) => void };
export const waiters = new Map<string, Waiter>();

export const spikeWait = defineAgentTool({
  name: "spike_wait",
  description: "Ask the user to type a test value in a form shown in the chat. Waits up to 60 seconds.",
  input: z.object({}),
  async execute(_input, { agent, paseo, signal }) {
    const requestId = randomUUID();
    const row = paseo.agents.ref(agent.id).timeline;
    await row.append({
      type: "plugin",
      id: requestId,
      kind: "spike",
      version: 1,
      data: { requestId, status: "pending" },
    });
    const text = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 600_000);
      signal.addEventListener("abort", () => resolve(null));
      waiters.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      });
    });
    waiters.delete(requestId);
    await row.append({
      type: "plugin",
      id: requestId,
      kind: "spike",
      version: 1,
      data: { requestId, status: "done" },
    });
    if (text === null) return { isError: true, text: "No answer in time." };
    await writeFile("/tmp/opencode/spike-value", text, { mode: 0o600 });
    return { text: `User answered with ${text.length} characters.` };
  },
});
