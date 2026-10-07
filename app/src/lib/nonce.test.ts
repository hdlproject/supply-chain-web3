import { createHmac } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { buildMessage, consumeNonce, issueNonce, verifyNonceToken } from "./nonce";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

describe("login nonce", () => {
  it("round-trips a freshly issued token", () => {
    const { token, message } = issueNonce();
    const payload = verifyNonceToken(token);
    expect(payload).not.toBeNull();
    expect(message).toBe(buildMessage(payload!.nonce));
  });

  it("rejects a tampered token", () => {
    const { token } = issueNonce();
    const [, signature] = token.split(".");
    const tamperedBody = Buffer.from(JSON.stringify({ nonce: "forged", exp: Date.now() + 60_000 })).toString(
      "base64url",
    );
    expect(verifyNonceToken(`${tamperedBody}.${signature}`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const expiredBody = Buffer.from(
      JSON.stringify({ nonce: "abc", exp: Date.now() - 1000 }),
    ).toString("base64url");
    // Re-sign it correctly so only expiry is being tested, not the signature check.
    const signature = createHmac("sha256", process.env.SESSION_SECRET!)
      .update(expiredBody)
      .digest()
      .toString("base64url");
    expect(verifyNonceToken(`${expiredBody}.${signature}`)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyNonceToken("not-a-real-token")).toBeNull();
    expect(verifyNonceToken("")).toBeNull();
  });

  it("each issued nonce is unique", () => {
    const a = issueNonce();
    const b = issueNonce();
    expect(a.token).not.toBe(b.token);
  });

  it("a nonce can only be consumed once", () => {
    const exp = Date.now() + 60_000;
    const nonce = `single-use-${Math.random()}`;
    expect(consumeNonce(nonce, exp)).toBe(true);
    expect(consumeNonce(nonce, exp)).toBe(false);
    expect(consumeNonce(nonce, exp)).toBe(false);
  });

  it("consuming one nonce doesn't block a different nonce", () => {
    const exp = Date.now() + 60_000;
    expect(consumeNonce("nonce-a", exp)).toBe(true);
    expect(consumeNonce("nonce-b", exp)).toBe(true);
  });
});
