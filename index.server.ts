import type { PluginServerContext } from "@getpaseo/plugin/server";
import { checkWritable, readSecret, stageSecret } from "./server/files";
import { attachTools } from "./server/hook";
import { resolveSecretPath } from "./server/paths";
import { createRegistry } from "./server/requests";
import { applyRules } from "./server/rules";
import { appendRow } from "./server/rows";
import { createSecretService } from "./server/tools";
import { secretsPending, secretsRead, secretsReject, secretsSubmit } from "./shared/contracts";
import { rulesSettings } from "./shared/rules";

export default function contribute(server: PluginServerContext) {
  const registry = createRegistry();
  const { requestSecrets, sendSecrets, handlers } = createSecretService({
    registry,
    files: { stage: stageSecret, read: readSecret, checkWritable },
    resolve: (cwd, input) => resolveSecretPath(cwd, input),
    appendRow,
  });

  const rules = server.registerSettings(rulesSettings);
  server.addHook("agent.create.before", async ({ request }) => {
    const current = await rules.read();
    if (current.status !== "ready") return;
    const config = applyRules(request.config, current.values);
    return config ? { ...request, config } : undefined;
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
