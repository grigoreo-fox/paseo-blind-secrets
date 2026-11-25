import type { PluginServerContext } from "@getpaseo/plugin/server";
import { spikeWait, waiters } from "./server/spike";
import { spikeDone } from "./shared/spike";

export default function contribute(server: PluginServerContext) {
  server.addHook("agent.open.before", async ({ request }) => {
    if (request.background || request.purpose !== "interactive") return;
    return { ...request, tools: [...request.tools, spikeWait] };
  });
  server.handle(spikeDone, ({ requestId, text }) => {
    const waiter = waiters.get(requestId);
    if (!waiter) return { ok: false };
    waiter.resolve(text);
    return { ok: true };
  });
  return () => {};
}
