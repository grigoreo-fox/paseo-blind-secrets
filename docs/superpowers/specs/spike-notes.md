# Prototype notes: what a plugin can do (2026-11-26)

Environment: Paseo CLI and daemon 0.16.2, provider OpenCode (model `anthropic/claude-haiku-5-5`), plugin installed from the project directory. The prototype is `server/spike.ts`, `client/spike.tsx`, `shared/spike.ts`: an agent tool `spike_wait` that appends a timeline row and waits for an RPC from a form drawn by a client renderer.

## Verified (with evidence)

| # | Capability | Result | Evidence |
|---|---|---|---|
| 1 | Plugin scaffold, typecheck, install, run | Works. `paseo plugin install <dir>` gives `running`. `@types/node` must be added for server code. | `npm run typecheck` clean; `paseo plugin ls` shows `blind-secrets running yes` |
| 2 | A plugin tool attached in `agent.open.before` reaches an agent | Works. The OpenCode agent sees it as `paseo_spike_wait` (provider prefixes the name) and calls it. | `paseo logs <agent> --json`: tool_call `paseo_spike_wait` |
| 3 | `timeline.append` from inside `execute` | Works. The row is stamped `pluginId: "blind-secrets"` and lands after the tool call, so it is at the bottom while the tool waits. | logs JSON: `tool_call ... running` followed by `{"type":"plugin","kind":"spike","data":{"status":"pending"}}` |
| 4 | Updating a row | Works. Re-appending with the same `id` replaced the row (one row, status `pending` then `done`). | logs JSON shows a single plugin row with `status: "done"` after the timeout |
| 5 | Tool can wait on a human | Works. The tool blocked past 60 s, resolved on its own timer, and the agent received `isError` text `No answer in time.` | agent reply: `It returned: "No answer in time."` |
| 6 | Agent cwd for path resolution | `context.agent.cwd` is the workspace dir (`~/projects/paseo-paste-secret`). `paseo run --cwd` did not change it for an agent started from this workspace. | `paseo inspect` shows `Cwd ~/projects/paseo-paste-secret` |

## Not verified yet (needs a real client; the daemon asks for a password)

- Text entry in a plugin timeline row, including on a phone.
- `copyText` from `@getpaseo/plugin/client/ui`.
- The `spike.done` RPC from the form back to the daemon, and the file written with the typed value (`/tmp/opencode/spike-value`).
- Whether the card renders in the chat with the right theme colours.

A prototype agent is waiting right now (10 minute limit) so the form can be tried in the user's own client.

## Findings that change the plan

1. **OpenCode keeps tool definitions in memory per directory.** Changing a tool's description while the OpenCode server runs makes every agent open in that directory fail with `Cannot connect the Paseo tool bridge to OpenCode ... HTTP 500`. The OpenCode log says `Conflicting Paseo tool definition: spike_wait`. Reverting the description fixed it at once. Consequence for the plugin: tool names, descriptions and input schemas must stay stable between reloads, or the tool must be renamed when its definition changes. Plan task 5 gets a rule: treat the definition as a published contract and bump the name suffix on change during development.
2. **Provider names the tool with a `paseo_` prefix** for OpenCode. Other providers may differ. Tool descriptions should tell the agent to call it by the name it sees.
3. **The `paseo` CLI and the web client versions differ** (daemon 0.16.2, hosted web app 0.17.4). Chrome blocks the hosted app from reaching `localhost` (Local Network Access), and the daemon requires a password for direct connections, so automated UI testing needs the user's credentials or the user's own client.
4. **Timeline rows are plain JSON in daemon memory** and visible in `paseo logs --json`. The design already keeps values out of row data; this confirms that anything put there is readable by anyone who can read the agent timeline.

## Implication for the design

The card-in-chat design is feasible on the server side (items 2 to 5 above). The only open risks are client-side input and clipboard behaviour. The composer pill remains the fallback if text entry inside a timeline row misbehaves on phones.
