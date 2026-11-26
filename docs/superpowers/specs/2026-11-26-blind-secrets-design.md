# blind-secrets: design

Plugin id: `blind-secrets`. Date: 2026-11-26. Status: approved; revised 2026-11-26 (pill dropped, eye icon, translations).

## Intent and why

The user often has to move secrets (API keys, passwords, tokens) between themselves and an agent. Today that means opening a terminal: to give the agent a key, or to pull out a key or password that the agent generated and wrote into a file without showing it in the session. Typing a secret into chat, or having the agent print it, puts it in the model context.

The plugin lets the user hand a secret to an agent, and receive one from it, through a form in Paseo. The value is never visible to the model in either direction.

## Goals

- Two agent tools:
  - `get_secrets`: the agent asks the user for secrets. The user types the values in a form and the plugin writes each one to a file. The agent learns only that it was written.
  - `show_secrets`: the agent names a file (and a label) and the user sees the value, with a copy button. The agent learns only that it was shown.
- A card in the chat timeline with the form, placed where the agent is waiting.
- In `show_secrets` the value is hidden by default and an eye icon at the right end of the field reveals it; Copy sits under the field.
- Works on desktop and mobile (verified on iPhone).
- All card text is translated into the languages Paseo itself supports: en, ar, es, fr, ja, ko, pt-BR, ru, zh-CN (source: Paseo `docs/i18n.md`). The plugin follows the app language. Model-facing tool text stays English.

## Non-goals

- Not a secret vault, no encryption at rest, no sync, no history of secrets.
- Not a defense against an agent that runs `cat` on the secret file itself with its normal shell tools. The plugin protects only the two paths it controls.
- No env-var injection. The value is written to a file only.
- No replacement of Paseo's native question or permission UI. A plugin cannot draw it.

## Anti-goals (failure even if it works)

- A secret value appearing in agent context, tool results, timeline row data, logs, or plugin RPC logs.
- A silent overwrite or write to a path the user did not see.

## Behavior (decided with the user)

- File format: the raw value only, one file per secret, for example `.secrets/app_token`. No `KEY=value`.
- Existing file: always overwritten.
- Paths: any path is allowed, but the form shows the full resolved path and the user confirms by submitting. Relative paths resolve against the agent's cwd.
- `get_secrets` input: a list of `{ name, path, description? }`. It waits for the user for up to 10 minutes. "Reject", or a timeout, returns an error result to the agent saying the user declined or did not answer.
- `show_secrets` input: a list of `{ label, path }`. A single secret shows one labelled field; several show a list. Each field is read-only with a copy button.
- Tool results contain only names, paths and statuses. Never values.

## Approaches considered

1. **Timeline card (chosen).** The card is a plugin-owned timeline row drawn by a registered renderer, so it sits in the chat, at the bottom while the agent waits. Trade-off: not pixel-identical to Paseo's native question block, which plugins cannot draw. A composer pill that mirrored the card was considered and dropped by the user: the card was verified on desktop and iPhone and the pill adds nothing.
2. **Workspace panel tab.** More room, but nothing appears near the prompt. Rejected.
3. **Composer toolbar control only.** Easy to miss that the agent is waiting. Rejected.

## Design

Runtimes follow the Paseo plugin layout: `index.server.ts`, `index.client.tsx`, `server/`, `client/`, `shared/`. Requirements: `requirements.paseo` set to the daemon version in use (to confirm during planning).

- **Server.** An `agent.open.before` hook attaches both tools to every non-background agent (`defineAgentTool`). `execute` creates a pending request in daemon memory and appends a timeline row (`kind: "secret-request"`) carrying only names, paths and status. It then waits on the request, resolved by an RPC from the client, with a 10 minute ceiling and the call's abort signal.
- **RPCs (shared Zod contracts).**
  - `secrets.submit`: client sends values for a request; the daemon validates the request id, writes the files, resolves the pending tool call, and updates the row status. Values exist only in this RPC input and the file write.
  - `secrets.reject`: resolves the tool call with a decline.
  - `secrets.read`: for `show_secrets`, the daemon reads the files and returns values to the client only.
- **Client.** A timeline renderer draws the card for `secret-request`, using `TextInput` for entry and a copy action for display. Colours come from `theme.colors`, layout from `layout.compact`.
- **Safety.** Never log values. Mask inputs. Clear values from component state on submit and on unmount. Create parent directories as needed and set file mode `0600`. A completed row keeps names and statuses and no values.

## Open verification (do first, as a throwaway spike)

- Text entry inside a plugin timeline row works on iOS and Android, including keyboard handling.
- Appending a row from inside an agent tool's `execute` works for the calling agent, and the row stays at the bottom while the tool waits.
- Copy to clipboard is available to plugin code on all platforms.

## Left to the builder

Exact visual styling, copy text and translations, and the file layout inside the plugin.
