import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const secretFormat = z.enum(["any", "json", "pem"]);

export const requestSecretsInput = z.object({
  secrets: z
    .array(
      z.object({
        name: z.string().min(1).describe("Label shown to the user and used as the key"),
        path: z.string().min(1).describe("File to write the secret to"),
        description: z.string().optional().describe("What the secret is for"),
        multiline: z
          .boolean()
          .optional()
          .describe("True for a multi-line value such as a private key or a credentials file"),
        format: secretFormat
          .optional()
          .describe("Check the pasted value before it is written: pem, json, or any (default)"),
      }),
    )
    .min(1),
});

export const sendSecretsInput = z.object({
  secrets: z
    .array(
      z.object({
        label: z.string().min(1).describe("Label shown to the user"),
        path: z.string().min(1).describe("File whose content is shown to the user"),
      }),
    )
    .min(1),
});

export const secretStatus = z.enum(["pending", "done", "rejected", "expired"]);

export const secretRowData = z
  .object({
    requestId: z.string(),
    kind: z.enum(["get", "show"]),
    status: secretStatus,
    items: z.array(
      z
        .object({
          label: z.string(),
          path: z.string(),
          resolvedPath: z.string(),
          description: z.string().optional(),
          multiline: z.boolean().optional(),
          format: secretFormat.optional(),
          error: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type SecretRowData = z.output<typeof secretRowData>;

const ok = z.object({ ok: z.literal(true) });

export const secretsSubmit = defineRpc({
  name: "secrets.submit",
  input: z.object({ requestId: z.string(), values: z.record(z.string(), z.string()) }),
  output: ok,
});

export const secretsReject = defineRpc({
  name: "secrets.reject",
  input: z.object({ requestId: z.string() }),
  output: ok,
});

export const secretsRead = defineRpc({
  name: "secrets.read",
  input: z.object({ requestId: z.string() }),
  output: z.object({
    items: z.array(
      z.object({ label: z.string(), value: z.string().optional(), error: z.string().optional() }),
    ),
  }),
});

export const secretsPending = defineRpc({
  name: "secrets.pending",
  input: z.object({ agentId: z.string() }),
  output: z.object({ requests: z.array(secretRowData) }),
});
