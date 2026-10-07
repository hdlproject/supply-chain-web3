import { NextRequest, NextResponse } from "next/server";

import { destroySession } from "@/lib/session";

// Next.js forbids mutating cookies during a Server Component's render pass
// (e.g. from a `redirect()` call inside a page's guard check) -- it's only
// legal from a Server Action or a Route Handler like this one. `guard.ts`
// routes here instead of calling `destroySession()` directly so a stale,
// role-mismatched session can actually be cleared before the user lands
// back on `/login`. The redirect destination is hardcoded here because this
// route has exactly one caller in the entire codebase (guard.ts), so there
// is no legitimate reason to accept an arbitrary `to` query parameter.
export async function GET(request: NextRequest) {
  await destroySession();
  return NextResponse.redirect(new URL("/login?error=unauthorized", request.url));
}
