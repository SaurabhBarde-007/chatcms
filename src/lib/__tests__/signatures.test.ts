import { describe, expect, it } from "vitest";
import { isValidSignature, signBody } from "../signatures";

describe("signatures", () => {
  const body = JSON.stringify({ hello: "world" });

  it("accepts a body signed with the same secret", () => {
    expect(isValidSignature(body, signBody(body, "s3cret"), "s3cret")).toBe(true);
  });

  it("rejects a wrong secret, a tampered body, or a missing header", () => {
    const sig = signBody(body, "s3cret");
    expect(isValidSignature(body, sig, "other")).toBe(false);
    expect(isValidSignature(body + " ", sig, "s3cret")).toBe(false);
    expect(isValidSignature(body, null, "s3cret")).toBe(false);
    expect(isValidSignature(body, "sha256=short", "s3cret")).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    expect(isValidSignature(body, signBody(body, ""), "")).toBe(false);
  });
});
