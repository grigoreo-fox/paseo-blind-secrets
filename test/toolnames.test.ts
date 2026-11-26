import { describe, expect, it } from "vitest";
import { createRegistry } from "../server/requests";
import { createSecretService } from "../server/tools";
import { requestSecretsInput, sendSecretsInput } from "../shared/contracts";

const service = createSecretService({
  registry: createRegistry(),
  files: {
    stage: async () => ({ commit: async () => undefined, discard: async () => undefined }),
    read: async () => "",
    checkWritable: async () => undefined,
  },
  resolve: (cwd, input) => `${cwd}/${input}`,
  appendRow: async () => undefined,
});

describe("tool definitions", () => {
  it("name the tools by direction: request from the user, send to the user", () => {
    expect(service.requestSecrets.name).toBe("request_secrets");
    expect(service.sendSecrets.name).toBe("send_secrets");
  });

  it("use input schemas named after the tools", () => {
    expect(requestSecretsInput.safeParse({ secrets: [{ name: "a", path: "p" }] }).success).toBe(true);
    expect(sendSecretsInput.safeParse({ secrets: [{ label: "a", path: "p" }] }).success).toBe(true);
  });

  it("tell the agent that send_secrets never shows it the values", () => {
    expect(service.sendSecrets.description).toMatch(/You will NOT see the values/);
    expect(service.sendSecrets.description).toMatch(/to the user/i);
  });

  it("tell the agent that request_secrets never returns the values", () => {
    expect(service.requestSecrets.description).toMatch(/You will NOT receive the values/);
  });

  it("do not depend on the agent or on settings, so every session gets one definition", () => {
    const again = createSecretService({
      registry: createRegistry(),
      files: {
        stage: async () => ({ commit: async () => undefined, discard: async () => undefined }),
        read: async () => "",
        checkWritable: async () => undefined,
      },
      resolve: (cwd, input) => `${cwd}/${input}`,
      appendRow: async () => undefined,
    });
    for (const key of ["requestSecrets", "sendSecrets"] as const) {
      expect(again[key].description).toBe(service[key].description);
      expect(again[key].name).toBe(service[key].name);
    }
  });
});
