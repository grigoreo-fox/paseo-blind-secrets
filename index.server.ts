import type { PluginServerContext } from "@getpaseo/plugin/server";
import { checkWritable, readSecret, stageSecret } from "./server/files";
import { attachTools } from "./server/hook";
import { resolveSecretPath } from "./server/paths";
import { createRegistry } from "./server/requests";
import { appendRow } from "./server/rows";
import { createSecretService } from "./server/tools";
import { secretsPending, secretsRead, secretsReject, secretsSubmit } from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  const registry = createRegistry();
  const { requestSecrets, sendSecrets, handlers } = createSecretService({
    registry,
    files: { stage: stageSecret, read: readSecret, checkWritable },
    resolve: (cwd, input) => resolveSecretPath(cwd, input),
    appendRow,
  });

  server.addHook("agent.open.before", async ({ request }) =>
    attachTools(request, [requestSecrets, sendSecrets]),
  );
  server.handle(secretsSubmit, handlers.submit);
  server.handle(secretsReject, handlers.reject);
  server.handle(secretsRead, handlers.read);
  server.handle(secretsPending, handlers.pending);

  return () => registry.dispose();
}
