Blind Secrets lets you pass secrets to an agent, and read secrets an agent made, without the values entering the chat or the model's context.

It adds two tools to every interactive agent:

- `request_secrets`: the agent names the secrets it needs and a file for each one. A card appears in the chat with a masked field per secret. When you press Write, the daemon saves each value to its file. The agent only learns that the files were written.
- `send_secrets`: the agent names files that hold secrets, for example a password it generated. A card shows each value hidden. An eye icon in the field reveals it and Copy puts it on your clipboard. The agent only learns that the secrets were shown.

## How it behaves

- A secret can be multi-line, for example a private key or a credentials file. The agent can ask for a check of the pasted text: `pem` needs complete BEGIN and END lines, `json` must parse. The card shows the field while you paste, then folds it into a line such as "PEM, 27 lines, 1.7 KiB" with an eye icon that opens it in a scrollable block. A value that fails the check cannot be written. Text, JSON and PEM are written as pasted, with line breaks and the final newline intact.
- Each secret is the raw value in its own file, with no `KEY=value` format and no trimming. New folders are created with mode `0700` and files with mode `0600`. A file is written to a temporary name and then renamed, so a failed write leaves the old file untouched, and a symlink is replaced rather than followed.
- An existing file is always overwritten. The card shows the full resolved path before you write. Relative paths resolve against the agent's working folder, and `~` means your home folder.
- Before it asks you anything, the plugin checks the targets. For `request_secrets` it checks that each path is not a folder and that the folder can be written. For `send_secrets` it reads each file. If a check fails, the agent gets an error that names the files and you see no card.
- Only text files up to 64 KiB are shown, and a typed value is limited to 64 KiB. Binary files, files that are not valid UTF-8 and special files such as pipes are refused.
- Reject, or no answer within 10 minutes, gives the agent an error and writes nothing.
- The card follows the Paseo app language: English, Arabic, Spanish, French, Japanese, Korean, Brazilian Portuguese, Russian and Simplified Chinese. Text sent to the agent stays in English.

## Agent rules

On its own an agent often does not know these tools exist. The plugin adds a short set of rules to the system prompt of agents when they are created: ask for secrets with `request_secrets`, give secrets with `send_secrets`, never read or print a secret file, and stop if the tools are missing. To change them, open this plugin's page under Settings, Plugins. The switch "Add the rules to new agents" turns the rules off and is saved as soon as you flip it. The "Rules text" field holds the wording: Save stores your edit, and Restore default brings back the original text. A change applies to agents created after you save it; existing agents keep the prompt they have. The rules are saved in each new agent's configuration and sent to its provider like any system prompt.

## Setup

Requires Paseo 0.16.2 or later on the daemon, and plugins enabled on that daemon. The only setting is the agent rules described above, found under Settings, Plugins, where you can also switch them off. There are no accounts, and the plugin makes no network requests and installs nothing. Background agents do not get the tools.

## What it reads, writes and sends

- Secret values travel only from the Paseo app to the daemon over the plugin's own connection, and the daemon writes or reads the files. They are not sent to the agent's provider and the plugin does not log them.
- The agent's provider does receive what the agent asked for and what the tools return: secret names, labels, file paths and short results such as how many files were written, or which files could not be shown and why.
- The connection between the Paseo app and the daemon is not encrypted by the plugin. Over a relay or Tailscale it is protected by that connection. On a direct connection over a local network with a password it is not, so use a relay or Tailscale for secrets.
- The chat row that holds the card stores names, paths and status, never values. Anyone who can read that agent's chat can read those paths.
- `send_secrets` reads any file the agent names, up to the limits above. You see the path on the card and the value stays hidden until you press the eye icon, but the file is read when the card opens.

## Limits

- The plugin protects only these two tools. An agent that has a shell can still read a secret file with its own commands, and then the value enters its context. Keep that in mind for secrets the agent should never see.
- The plugin's requests carry no caller identity. Any client that is authorized on the daemon can call them, and a request id is visible in the chat row. The values are not in the row, but a client that knows a request id can answer or close a pending request.
- If several secrets are written and the system fails while renaming them, some files can be updated and others not.
- The OpenCode provider rejects a tool whose description or schema changes while an agent that holds it is open, so after a plugin update, start new agents.
