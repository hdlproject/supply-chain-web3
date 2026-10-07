import { beforeAll, describe, expect, it } from "vitest";

import { signSession, verifySession } from "./session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

describe("session token signing", () => {
  it("round-trips a valid payload", () => {
    const token = signSession({ wallet: "abc123", role: "Source", iat: 1000 });
    expect(verifySession(token)).toEqual({ wallet: "abc123", role: "Source", iat: 1000 });
  });

  it("rejects a tampered body", () => {
    const token = signSession({ wallet: "abc123", role: "Source", iat: 1000 });
    const [, signature] = token.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify({ wallet: "attacker", role: "Admin", iat: 1000 }),
    ).toString("base64url");
    expect(verifySession(`${tamperedBody}.${signature}`)).toBeNull();
  });

  it("rejects a malformed or empty token", () => {
    expect(verifySession("not-a-real-token")).toBeNull();
    expect(verifySession("")).toBeNull();
  });
});
