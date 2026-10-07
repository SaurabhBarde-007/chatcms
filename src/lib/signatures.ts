import crypto from "node:crypto";

// Meta (X-Hub-Signature-256) and our bot API (X-Signature) use the same format:
// "sha256=<hex HMAC-SHA256 of the raw request body>".

export function signBody(rawBody: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function isValidSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(signBody(rawBody, secret));
  const received = Buffer.from(header);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
