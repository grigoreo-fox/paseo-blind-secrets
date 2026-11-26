import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readSecret, writeSecret } from "./server/files";
import { resolveSecretPath } from "./server/paths";
import { createRegistry } from "./server/requests";
import { appendRow } from "./server/rows";
import { createSecretService } from "./server/tools";
import { secretsPending, secretsRead, secretsReject, secretsSubmit } from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  const registry = createRegistry();
  const { getSecrets, showSecrets, handlers } = createSecretService({
    registry,
    files: { write: writeSecret, read: readSecret },
    resolve: (cwd, input) => resolveSecretPath(cwd, input),
    appendRow,
  });

  server.addHook("agent.open.before", async ({ request }) => {
    if (request.background || request.purpose !== "interactive") return;
    return { ...request, tools: [...request.tools, getSecrets, showSecrets] };
  });
  server.handle(secretsSubmit, handlers.submit);
  server.handle(secretsReject, handlers.reject);
  server.handle(secretsRead, handlers.read);
  server.handle(secretsPending, handlers.pending);

  return () => registry.dispose();
}
