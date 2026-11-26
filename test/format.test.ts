import { describe, expect, it } from "vitest";
import { checkFormat, detectFormat, summarize } from "../shared/format";

const PEM = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n";

describe("checkFormat", () => {
  it("accepts anything for format any, including empty text", () => {
    expect(checkFormat("whatever\nlines", "any")).toBeNull();
  });

  it("accepts a PEM block and keeps its trailing newline valid", () => {
    expect(checkFormat(PEM, "pem")).toBeNull();
    expect(checkFormat(PEM.trimEnd(), "pem")).toBeNull();
  });

  it("accepts several PEM blocks (a certificate chain)", () => {
    expect(checkFormat(PEM + PEM.replaceAll("PRIVATE KEY", "CERTIFICATE"), "pem")).toBeNull();
  });

  it("refuses a truncated PEM", () => {
    expect(checkFormat(PEM.split("\n").slice(0, 2).join("\n"), "pem")).toBe("invalid_pem");
  });

  it("refuses a PEM whose END label differs from BEGIN", () => {
    expect(checkFormat(PEM.replace("END PRIVATE KEY", "END CERTIFICATE"), "pem")).toBe("invalid_pem");
  });

  it("refuses text around the PEM block", () => {
    expect(checkFormat("hello\n" + PEM, "pem")).toBe("invalid_pem");
  });

  it("refuses an empty PEM body", () => {
    expect(checkFormat("-----BEGIN X-----\n-----END X-----\n", "pem")).toBe("invalid_pem");
  });

  it("accepts valid JSON and refuses invalid JSON", () => {
    expect(checkFormat('{"a": 1,\n "b": [2]}\n', "json")).toBeNull();
    expect(checkFormat('{"a": 1,', "json")).toBe("invalid_json");
    expect(checkFormat("", "json")).toBe("invalid_json");
  });
});

describe("detectFormat", () => {
  it("recognises PEM, JSON and plain text", () => {
    expect(detectFormat(PEM)).toBe("pem");
    expect(detectFormat('{"type":"service_account"}')).toBe("json");
    expect(detectFormat("line one\nline two")).toBe("any");
  });

  it("does not call a bare number or word JSON", () => {
    expect(detectFormat("123")).toBe("any");
    expect(detectFormat("true")).toBe("any");
  });
});

describe("summarize", () => {
  it("counts lines the way a person does, ignoring one trailing newline", () => {
    expect(summarize("a\nb\nc\n").lines).toBe(3);
    expect(summarize("a\nb\nc").lines).toBe(3);
    expect(summarize("a").lines).toBe(1);
  });

  it("counts CRLF as one break", () => {
    expect(summarize("a\r\nb\r\n").lines).toBe(2);
  });

  it("measures bytes, not characters", () => {
    expect(summarize("я").bytes).toBe(2);
  });

  it("formats sizes in B and KiB", () => {
    expect(summarize("x".repeat(900)).size).toEqual({ unit: "B", value: "900" });
    expect(summarize("x".repeat(1740)).size).toEqual({ unit: "KiB", value: "1.7" });
    expect(summarize("x".repeat(2048)).size).toEqual({ unit: "KiB", value: "2" });
  });
});
