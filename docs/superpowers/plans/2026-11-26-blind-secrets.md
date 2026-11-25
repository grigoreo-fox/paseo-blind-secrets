# blind-secrets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Paseo plugin that lets an agent ask the user for secrets (written to files) and show secrets to the user (read from files), without the values ever entering the model context.

**Architecture:** The daemon subprocess attaches two agent tools (`get_secrets`, `show_secrets`) via `agent.open.before`. Each call registers a pending request, appends a plugin-owned timeline row with names, paths and status only, and waits. A client timeline renderer draws a form card, and a composer pill opens the same form in a popover. Values travel only through plugin RPCs between the client and the daemon, and the daemon writes or reads the files.

**Tech Stack:** TypeScript, Zod, `@getpaseo/plugin` (client and server entries), React Native primitives, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-blind-secrets-design.md`

## Global Constraints

- Plugin id `blind-secrets`; tool names `get_secrets` and `show_secrets` (must match `/^[a-z][a-z0-9_]*$/`).
- `requirements.paseo` is the CLI version printed by `paseo --version`, with `>=`.
- File content is the raw value only, one file per secret, no `KEY=value`. Existing files are always overwritten. Files are written with mode `0600`; parent directories are created.
- Relative paths resolve against the agent's cwd. Any path is allowed, but the form shows the full resolved path.
- `get_secrets` waits up to 10 minutes. Reject or timeout returns an error result (`isError: true`) saying the user declined or did not answer.
- Tool results, timeline row `data`, logs and thrown error messages never contain secret values.
- Client code: React Native primitives only, colours from `theme.colors`, padding from `layout.compact`, no DOM globals, no `node:` imports outside `server/`.
- Timeline row `kind: "secret-request"`, `version: 1`; row `id` is the request id.
- Tools attach to agents with `request.background === false` and `purpose === "interactive"`.

## Review Focus

- Empty `secrets` array in either tool: reject at schema level (`min(1)`), result is a validation error to the agent.
- Path with `~`, `..` or an absolute path outside cwd: allowed, shown resolved in the form; `~` expands to the home directory.
- Value with trailing newline or leading/trailing spaces: written byte for byte, never trimmed.
- `show_secrets` on a missing or unreadable file: that field reports an error, other fields still show, and the tool result names the path and says "not readable", never content.
- Agent closed, tool call aborted or 10 minutes pass: pending request is dropped, the row is updated to `expired`, and a late submit is rejected with an error.
- Double submit or submit for an unknown request id: second call fails with `unknown_request`, and the file is not written twice.
- Two concurrent requests from one agent: each has its own id, row and pill entry.
- Daemon restart: rows survive no longer than the daemon, pending requests are gone, and the card must render `expired` for a row whose request is not pending.

## File Structure

```
paseo-plugin.json
OVERVIEW.md
package.json, tsconfig.json, vitest.config.ts
index.server.ts          wires hook, tools, RPC handlers
index.client.tsx         registers renderer and pill
shared/contracts.ts      zod schemas, RPC and row-data contracts
server/paths.ts          resolveSecretPath
server/files.ts          writeSecret, readSecret
server/requests.ts       pending-request registry with timeout
server/tools.ts          get_secrets and show_secrets definitions
server/rows.ts           append and update timeline rows
client/SecretCard.tsx    card rendered in the timeline
client/SecretForm.tsx    fields, copy, submit, reject (shared by card and pill)
client/pill.ts           pill registration per agent
test/*.test.ts           server unit tests
```

---

### Task 1: Scaffold and spike

**Files:**
- Create: project via `paseo plugin init`, `.git`, then edit `paseo-plugin.json`
- Create (throwaway, deleted at the end of this task): `client/spike.tsx`, `server/spike.ts`

**Interfaces:**
- Produces: a typechecking plugin skeleton, and a recorded answer (in `docs/superpowers/specs/spike-notes.md`) to each of the three open questions in the spec.

- [ ] **Step 1:** Run `paseo --version`, then `paseo plugin init /home/dev/projects/paseo-paste-secret` (the existing `docs/` stays), `npm install`, `git init`. Check `pluginsEnabled` in the daemon `config.json` (`paseo daemon status --json` gives `home`). If it is false or absent, stop and ask the user for permission with the exact warning from the paseo-plugin skill before enabling.
- [ ] **Step 2:** Set `paseo-plugin.json` to `{ "id": "blind-secrets", "name": "blind-secrets", "description": "Give an agent secrets, and read its secrets, without the model seeing them", "requirements": { "paseo": ">=<cli version>" } }`. Delete the scaffold's greeting files and their imports.
- [ ] **Step 2b:** Build the spike: a server tool `spike_wait` (via `defineAgentTool` attached in `agent.open.before`) that appends a `kind: "spike"` row with `timeline.append`, then waits for an RPC `spike.done` or 60 s. A client renderer for `spike` draws a `TextInput` (secureTextEntry) and a Pressable that copies the text with the host clipboard API and calls `spike.done`.
- [ ] **Step 3:** `npm run typecheck`, `paseo plugin install /home/dev/projects/paseo-paste-secret`, `paseo plugin ls` shows `running`. In a Codex or Claude agent in a test workspace, ask it to call `spike_wait`. Check and write to `docs/superpowers/specs/spike-notes.md`: (a) the row appears for the calling agent and stays at the bottom while the tool waits; (b) text entry works on web, and on a phone client if one is available (keyboard does not cover the field, no input lag); (c) copy to clipboard works on each tried platform.
- [ ] **Step 4:** If (a) fails, stop and report to the user: the card design needs revisiting. If (b) fails on a phone, note it and plan for the pill popover as the only phone entry point. If (c) fails, report.
- [ ] **Step 5:** Delete `client/spike.tsx`, `server/spike.ts` and their registrations. Commit: `git add -A && git commit -m "chore: scaffold blind-secrets and record spike results"`.

---

### Task 2: Shared contracts

**Files:**
- Create: `shared/contracts.ts`
- Test: `test/contracts.test.ts`

**Interfaces:**
- Produces:
  - `getSecretsInput: ZodObject` = `{ secrets: Array<{ name: string; path: string; description?: string }> (min 1) }`
  - `showSecretsInput: ZodObject` = `{ secrets: Array<{ label: string; path: string }> (min 1) }`
  - `SecretRowData` (zod `secretRowData`) = `{ requestId: string; kind: "get" | "show"; status: "pending" | "done" | "rejected" | "expired"; items: Array<{ label: string; path: string; resolvedPath: string; description?: string; error?: string }> }`. It has no value fields.
  - RPCs (`defineRpc`): `secretsSubmit` (`secrets.submit`: `{ requestId, values: Record<label, string> }` → `{ ok: true }`), `secretsReject` (`secrets.reject`: `{ requestId }` → `{ ok: true }`), `secretsRead` (`secrets.read`: `{ requestId }` → `{ items: Array<{ label: string; value?: string; error?: string }> }`), `secretsPending` (`secrets.pending`: `{ agentId }` → `{ requests: SecretRowData[] }`).

- [ ] **Step 1:** Write failing tests: `getSecretsInput` rejects `{ secrets: [] }` and accepts one item; `secretRowData` strips or rejects an extra `value` key (use `.strict()` and assert `parse` throws on `{..., items:[{ label:"a", path:"p", resolvedPath:"/p", value:"x" }]}`).
- [ ] **Step 2:** `npx vitest run test/contracts.test.ts` fails.
- [ ] **Step 3:** Implement the schemas and `defineRpc` contracts above in `shared/contracts.ts` (Zod and `@getpaseo/plugin` only).
- [ ] **Step 4:** Tests pass; `npm run typecheck` passes.
- [ ] **Step 5:** Commit `feat: add shared contracts`.

---

### Task 3: Paths and files

**Files:**
- Create: `server/paths.ts`, `server/files.ts`
- Test: `test/paths.test.ts`, `test/files.test.ts`

**Interfaces:**
- Produces:
  - `resolveSecretPath(cwd: string, input: string, home?: string): string` — expands a leading `~` or `~/` with `home` (default `os.homedir()`), resolves relative paths against `cwd`.
  - `writeSecret(absPath: string, value: string): Promise<void>` — `mkdir -p` the parent, writes bytes exactly, mode `0600` (also applied when overwriting).
  - `readSecret(absPath: string): Promise<string>` — UTF-8, no trimming; rejects with an error whose message is `"not readable: <absPath>"` and never includes content.

- [ ] **Step 1:** Write failing tests in a temp dir: relative path resolves under cwd; `~/x` resolves under the passed `home`; an absolute path is unchanged; `writeSecret` creates nested dirs, stores `"  a\n"` byte for byte, results in mode `0600`, and overwriting a file with mode `0644` ends at `0600`; `readSecret` returns the same bytes, and a missing file rejects with `not readable:` and the path.
- [ ] **Step 2:** Run the two test files; they fail.
- [ ] **Step 3:** Implement with `node:path`, `node:fs/promises`, `node:os`. For the overwrite mode, `chmod` after write.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat: secret path resolution and file io`.

---

### Task 4: Pending-request registry

**Files:**
- Create: `server/requests.ts`
- Test: `test/requests.test.ts`

**Interfaces:**
- Consumes: `SecretRowData` from `shared/contracts.ts`.
- Produces:
  - `type Outcome = { kind: "submitted" } | { kind: "rejected" } | { kind: "expired" }`
  - `createRegistry(options?: { timeoutMs?: number }): Registry` (default `600_000`)
  - `Registry.open(input: { agentId: string; data: SecretRowData; signal?: AbortSignal }): { id: string; outcome: Promise<Outcome> }` — `id` is `data.requestId`.
  - `Registry.get(id: string): SecretRowData | undefined`
  - `Registry.listForAgent(agentId: string): SecretRowData[]`
  - `Registry.settle(id: string, outcome: Outcome): boolean` — returns false when `id` is unknown or already settled.
  - `Registry.onChange(listener: (id: string, status: SecretRowData["status"]) => void): () => void`

- [ ] **Step 1:** Write failing tests with fake timers: `settle` resolves `outcome` and returns true once, then false; timeout resolves `{ kind: "expired" }` and removes the request; an aborted `signal` resolves `expired`; `listForAgent` returns only that agent's pending requests; two opens for one agent have different ids; `onChange` fires with `done`, `rejected` or `expired` accordingly.
- [ ] **Step 2:** Run; fails.
- [ ] **Step 3:** Implement with a `Map`. Clear the timer on settle.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat: pending request registry`.

---

### Task 5: Agent tools, rows and RPC handlers

**Files:**
- Create: `server/rows.ts`, `server/tools.ts`
- Modify: `index.server.ts`
- Test: `test/tools.test.ts`

**Interfaces:**
- Consumes: Tasks 2 to 4.
- Produces:
  - `appendRow(paseo, agentId: string, data: SecretRowData): Promise<void>` — `paseo.agents.ref(agentId).timeline.append({ type: "plugin", id: data.requestId, kind: "secret-request", version: 1, data })`. Re-appending with the same id updates the row.
  - `createTools(deps: { registry: Registry; files: { write; read }; paths: { resolve } }): { getSecrets: AgentToolDefinition; showSecrets: AgentToolDefinition }`.
  - In `index.server.ts`: the `agent.open.before` hook adds both tools when `!request.background && request.purpose === "interactive"`, and the handlers for `secretsSubmit`, `secretsReject`, `secretsRead`, `secretsPending` that call the registry and the file functions.
  - Tool result text on success: `get_secrets` → `"Wrote N secret(s): <paths>"`; `show_secrets` → `"Showed N secret(s) to the user: <paths>"`. Decline: `{ isError: true, text: "The user declined to provide the secrets." }`. Timeout: `{ isError: true, text: "The user did not answer in time." }`.

- [ ] **Step 1:** Write failing tests with a fake `paseo` (records `timeline.append` calls) and fake file deps, using the registry with a short timeout: (a) `getSecrets.execute` appends a row with status `pending` whose `data` has no values, then after `secretsSubmit` runs with `{ a: "S3CR3T" }` the file dep is called with the resolved path and exact value, the tool returns the success text, and neither the returned text, nor `structuredContent`, nor any appended row contains `"S3CR3T"`; (b) `secretsReject` gives the decline error result; (c) timeout gives the timeout result and an `expired` row; (d) a second `secretsSubmit` for the same id throws `unknown_request` and the write dep is called once; (e) `showSecrets.execute` waits, `secretsRead` returns values only to its caller, and a missing file gives an item with `error` and no value; the tool result lacks the value; (f) submit with a label that is not in the request throws.
- [ ] **Step 2:** Run; fails.
- [ ] **Step 3:** Implement `server/rows.ts`, `server/tools.ts` (use `defineAgentTool`, the inputs from `shared/contracts.ts`, `context.agent.cwd` for resolution, `context.signal` to the registry). `secretsRead` returns values only when the request kind is `show`, is pending, and for its own id. Wire everything in `index.server.ts` and return a cleanup that clears registry timers. Never `console.log` values or the RPC inputs.
- [ ] **Step 4:** Tests pass; `npm run typecheck` passes.
- [ ] **Step 5:** Commit `feat: get_secrets and show_secrets tools`.

---

### Task 6: Client card and form

**Files:**
- Create: `client/SecretForm.tsx`, `client/SecretCard.tsx`
- Modify: `index.client.tsx`

**Interfaces:**
- Consumes: contracts from Task 2.
- Produces:
  - `SecretForm(props: { data: SecretRowData; theme: PluginTheme; layout: PluginLayout })` — for `kind: "get"`: one masked `TextInput` per item (label, description, resolved path shown under it), buttons "Write" and "Reject"; submit calls `useRpc(secretsSubmit)` with `values` keyed by label, then clears local state. For `kind: "show"`: calls `secretsRead` on mount, shows each value in a read-only field with a "Copy" button and a reveal toggle (masked by default), clears values on unmount. For status other than `pending`: a one-line summary (written, rejected, expired) and no fields.
  - `SecretCard` is the renderer component: `client.addTimelineRenderer({ kind: "secret-request", version: 1, schema: secretRowData, Component: SecretCard })`. If the request is not pending on the daemon (check with `secretsPending`) while the row says `pending`, show `expired`.

- [ ] **Step 1:** Implement the form and card per the interfaces. Use only React Native primitives; all colours from `theme.colors`; padding from `layout.compact`. Disable "Write" until every field is non-empty (do not trim the value that is sent). Show an inline error from a failed RPC.
- [ ] **Step 2:** Register the renderer in `index.client.tsx`; `npm run typecheck`.
- [ ] **Step 3:** Run the audit from the paseo-plugin skill: `rg -n "document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=" client/` — no hits.
- [ ] **Step 4:** Reload with `paseo plugin reload blind-secrets`. In a test agent, ask it to call `get_secrets` for one secret at `.secrets/app_token` and enter `S3CR3T `. Verify: the file contains exactly `S3CR3T ` (check with `xxd`), mode `0600`, the agent's reply never contains the value, and the card turns to "written". Repeat with Reject. Then `show_secrets` on that file; verify the card shows it, copy works, and the agent transcript has no value.
- [ ] **Step 5:** Commit `feat: secret card and form`.

---

### Task 7: Composer pill

**Files:**
- Create: `client/pill.ts`
- Modify: `index.client.tsx`

**Interfaces:**
- Consumes: `secretsPending`, `SecretForm`.
- Produces: `registerPill(client: PluginClientContext): () => void` — for each agent in `client.paseo.agents.list({ subscribe })` (same ownership pattern as the paseo-plugin skill's pill example), poll `secretsPending({ agentId })` every 2 seconds while the agent is running (stop when idle), and show a pill `Secrets (N)` with `behavior: { kind: "popover", Content }` only when N > 0. `Content` renders `SecretForm` for each pending request. `remove()` the pill when N is 0 and on cleanup.

- [ ] **Step 1:** Implement per the interface; `npm run typecheck`.
- [ ] **Step 2:** Reload and verify: while an agent waits on `get_secrets`, the pill appears with the right count, the popover submits and the card also updates; after a reject or expiry the pill disappears. With two concurrent requests from one agent the count is 2. Check a compact (phone-width) window.
- [ ] **Step 3:** Commit `feat: composer pill for pending secrets`.

---

### Task 8: Listing and final verification

**Files:**
- Create: `OVERVIEW.md`
- Modify: `package.json` (`files` includes `OVERVIEW.md`)

- [ ] **Step 1:** Write `OVERVIEW.md` per the paseo-plugin skill's listing contract: what it does in plain terms, setup (daemon `>=` the manifest version), what it reads and writes and where (files you name, mode `0600`, overwrite), and the known limit (an agent can still read the file with its own shell tools). Sentence case, no em dashes, no install commands.
- [ ] **Step 2:** Run `npm test`, `npm run typecheck`, and the client audit; all must pass. Run `paseo plugin ls`: `blind-secrets` is `running` with no error. Run `paseo plugin logs blind-secrets` after the end-to-end runs and confirm no secret value appears in it.
- [ ] **Step 3:** Commit `docs: add overview`.
