Blind secrets lets you pass secrets to an agent, and read secrets an agent made, without the values ever entering the chat or the model's context.

It adds two tools to every interactive agent:

- `get_secrets`: the agent names the secrets it needs and the file for each one. A card appears in the chat with a masked field per secret. When you press Write, the daemon saves each value to its file. The agent only learns that the files were written.
- `show_secrets`: the agent names files that hold secrets, for example a password it generated. A card shows each value hidden. An eye icon in the field reveals it and Copy puts it on your clipboard. The agent only learns that the secrets were shown.

## How it behaves

- Each secret is written as the raw value in its own file, with no `KEY=value` format and no trimming. Parent folders are created and the file mode is `0600`.
- An existing file is always overwritten. The card shows the full resolved path before you write. Relative paths resolve against the agent's working folder, and `~` means your home folder.
- Reject, or no answer within 10 minutes, gives the agent an error and writes nothing.
- The card follows the Paseo app language: English, Arabic, Spanish, French, Japanese, Korean, Brazilian Portuguese, Russian and Simplified Chinese. Text sent to the agent stays in English.

## Setup

Requires Paseo 0.16.2 or later on the daemon, and plugins enabled on that daemon. There are no settings or accounts. Background agents do not get the tools.

## What it reads and sends

Values travel only from the Paseo app to the daemon over the plugin's own connection, and the daemon writes or reads the files. The chat row that holds the card stores names, paths and status, never values. The plugin does not log values.

## Limits

The plugin protects only these two tools. An agent that has a shell can still read a secret file with its own commands, and then the value enters its context. Keep that in mind for secrets the agent should never see. The OpenCode provider rejects a tool whose description or schema changes while an agent that holds it is open, so after updating the plugin, start new agents.
