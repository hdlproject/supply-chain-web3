import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const NONCE_TTL_MS = 5 * 60 * 1000;

export type NonceTokenPayload = {
  nonce: string;
  exp: number;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET is not set");
  }
  return value;
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

/**
 * The server never stores issued nonces anywhere (no session/db row) — it
 * signs {nonce, exp} the same way session.ts signs a session payload, and
 * re-verifies that signature later. A short exp (5 min) is what bounds
 * replay, not server-side single-use tracking.
 */
export function issueNonce(): { token: string; message: string } {
  const nonce = base64url(randomBytes(24));
  const exp = Date.now() + NONCE_TTL_MS;
  const body = base64url(Buffer.from(JSON.stringify({ nonce, exp } satisfies NonceTokenPayload), "utf8"));
  const signature = base64url(createHmac("sha256", secret()).update(body).digest());
  return { token: `${body}.${signature}`, message: buildMessage(nonce) };
}

export function buildMessage(nonce: string): string {
  return `ChainTrace login\nnonce: ${nonce}`;
}

export function verifyNonceToken(token: string): NonceTokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = base64url(createHmac("sha256", secret()).update(body).digest());
  const provided = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.nonce === "string" && typeof payload.exp === "number") {
      if (Date.now() > payload.exp) return null;
      return payload as NonceTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}
