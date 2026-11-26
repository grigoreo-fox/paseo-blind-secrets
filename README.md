# Blind Secrets

A [Paseo](https://paseo.sh) plugin that lets you pass secrets to an AI agent, and read secrets an agent made, without the values ever entering the chat or the model's context.

You no longer need a terminal to move an API key or a generated password. The agent asks, a private card appears in the chat, and the value goes straight to a file.

<!-- screenshots: assets/screenshots/get-secrets.png, assets/screenshots/show-secrets.png -->

## What it adds

Two tools for every interactive agent:

| Tool | What the agent does | What you see | What the agent learns |
| --- | --- | --- | --- |
| `get_secrets` | Names the secrets it needs and a file for each | A card with a masked field per secret and the full path it will write to | Only that the files were written (or that you declined) |
| `show_secrets` | Names files that hold secrets, for example a password it generated | A card with each value hidden, an eye icon to reveal it, and Copy | Only that the secrets were shown |

The agent never receives a value in either direction. Values travel from the Paseo app to the daemon, and the daemon writes or reads the file.

## Behavior

- One file per secret, holding the raw value: no `KEY=value`, no trimming. Files are `0600`, new folders `0700`, and a write goes through a temporary file and a rename.
- An existing file is always overwritten. The card shows the resolved path first.
- The plugin checks the targets before it asks you. If a path is a folder, is not writable, or a file to show is missing, binary or over 64 KiB, the agent gets the error and you see nothing.
- No answer in 10 minutes, or Reject, returns an error to the agent and writes nothing.
- The card is translated into the languages Paseo supports: English, Arabic, Spanish, French, Japanese, Korean, Brazilian Portuguese, Russian and Simplified Chinese.

## Install

Requires Paseo 0.16.2 or later with plugins enabled on the daemon.

```bash
paseo plugin add git:grigoreo-fox/paseo-blind-secrets
```

Start new agents after installing or updating.

## Limits

The plugin protects only these two tools. An agent with a shell can still read a secret file with its own commands, and then the value enters its context. The plugin's requests carry no caller identity, so any client authorized on the daemon can call them. See [OVERVIEW.md](OVERVIEW.md) for the full list.

## Development

```bash
npm install
npm test
npm run typecheck
paseo plugin install "$PWD"
paseo plugin reload blind-secrets
```

The daemon part is in `server/` (tools, request registry, file handling), the card is in `client/`, and the contracts shared by both are in `shared/`. The OpenCode provider rejects a tool whose description or schema changes while an agent that holds it is open, so close such agents before reloading a changed definition.

The eye and keyhole icon in `client/icons.ts` is traced from the plugin icon. The eye outline idea follows Lucide's `eye-off` icon (ISC license).
