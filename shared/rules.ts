import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_RULES = [
  "Secrets (passwords, API keys, tokens, private keys):",
  "- Never ask the user for a secret in chat, and never ask them to paste, export or type it themselves. Use the request_secrets tool: the user types the value into a private form and it is written to the file you name. You will not see the value.",
  "- To give the user a secret you generated, save it to a file and use the send_secrets tool. The user sees it privately. Do not print it in chat.",
  "- Never read, print, copy into chat, hash or log the content of a file that holds a secret. Pass the file path to the program that needs it.",
  "- Your tool list may prefix these tool names. If the tools are not available, tell the user and stop. Do not take a secret in chat instead.",
].join("\n");

export const rulesSettings = defineSettings({
  id: "agent-rules",
  scope: "host",
  version: 1,
  schema: z.object({
    enabled: z.boolean().default(true),
    text: z.string().default(DEFAULT_RULES),
  }),
});
