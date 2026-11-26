import type { AgentToolDefinition } from "@getpaseo/plugin/server";

export function attachTools<
  Request extends { background: boolean; purpose: string; tools: AgentToolDefinition[] },
>(request: Request, tools: AgentToolDefinition[]): Request | undefined {
  if (request.background || request.purpose !== "interactive") return undefined;
  return { ...request, tools: [...request.tools, ...tools] };
}
