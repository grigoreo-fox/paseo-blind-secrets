# Backlog

Decisions of 2026-11-26. Items are ordered by when they were agreed, not by priority.

## Waiting for Paseo

- **Move the agent rules to `appendSystemPrompt`.** Today (daemon 0.16.2) the `agent.open.before` request has no `appendSystemPrompt`, so the rules are added to the saved `systemPrompt` in `agent.create.before` and only reach agents created after the setting changed. When a Paseo release ships `appendSystemPrompt` on `agent.open.before` (documented at paseo.sh/docs/plugins/hooks, not in the 0.16.2 SDK), switch to it. Then existing agents get the rules on their next open, a settings change applies to them too, and the saved prompt stays clean. Raise `requirements.paseo` when doing so. Keep the same settings document.

## Agreed for later

- **CI.** GitHub Actions: `npm ci`, typecheck, tests, and an install from a clean checkout without `node_modules` (this would have caught the broken 0.1.0). Optional later: a Paseo compatibility matrix like Secure Input's.
- **Settings screen extras.** A "Check" action that confirms the plugin works, and a `SECURITY.md` with the threat model.
- **Transport encryption.** `node:crypto` exists only on the daemon; the app bundle cannot import `node:`. The app side needs WebCrypto (not verified on Hermes/iOS) or a runtime dependency, which brings a lockfile and a `build` command. Decide after checking how the user connects (relay or Tailscale already encrypt; direct LAN with a password does not). Until then OVERVIEW says so plainly.

## Not doing

- Expiry and cleanup of written files (the files are meant to stay).
- Running a command with the secret injected.
- Binary files.

## Open ends

- Registry: the 0.1.1 fix is PR #3395 in getpaseo/plugins. 0.2.0 is submitted after it.
- Reviewer-flagged minors not yet fixed: control and bidi characters in paths and labels, prototype-key labels (`Object.hasOwn`), empty value accepted by the server, registry after dispose, abort listener cleanup, values kept after Close, flicker to "expired" right after a successful submit, error text colour, `autoComplete` on inputs.
- Drag and drop of a file onto the card (desktop only).
