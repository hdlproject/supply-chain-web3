import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import type { DemoRole } from "./demo-accounts";

export const SESSION_COOKIE = "scw_session";

export type SessionPayload = {
  wallet: string;
  role: DemoRole;
  iat: number;
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

export function signSession(payload: SessionPayload): string {
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = base64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${signature}`;
}

export function verifySession(token: string): SessionPayload | null {
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
    if (
      typeof payload.wallet === "string" &&
      typeof payload.role === "string" &&
      typeof payload.iat === "number"
    ) {
      return payload as SessionPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export async function createSession(payload: Omit<SessionPayload, "iat">): Promise<void> {
  const token = signSession({ ...payload, iat: Date.now() });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
