import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const NONCE_TTL_MS = 5 * 60 * 1000;

// The server doesn't persist issued nonces (see note on `issueNonce` below),
// but a verified nonce must still only be usable once. This in-memory map
// (nonce -> expiry ms) tracks nonces that have already been consumed by a
// successful login, pruned opportunistically by TTL — an appropriate fit for
// this single-process demo deployment.
const consumedNonces = new Map<string, number>();

function pruneConsumed(): void {
  const now = Date.now();
  for (const [nonce, exp] of consumedNonces) {
    if (now > exp) consumedNonces.delete(nonce);
  }
}

/**
 * Marks a nonce as consumed. Returns `false` if it was already consumed
 * (i.e. this token/signature pair is being replayed), `true` if this is the
 * first successful use.
 */
export function consumeNonce(nonce: string, exp: number): boolean {
  pruneConsumed();
  if (consumedNonces.has(nonce)) {
    return false;
  }
  consumedNonces.set(nonce, exp);
  return true;
}

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
 * re-verifies that signature later. The short exp (5 min) bounds how long a
 * nonce is valid at all; `consumeNonce` (below) additionally tracks which
 * nonces have already been used, so a verified token/signature pair can
 * only complete a login once.
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
