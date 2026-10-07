import { NextRequest, NextResponse } from "next/server";

import { destroySession } from "@/lib/session";

// Next.js forbids mutating cookies during a Server Component's render pass
// (e.g. from a `redirect()` call inside a page's guard check) -- it's only
// legal from a Server Action or a Route Handler like this one. `guard.ts`
// routes here instead of calling `destroySession()` directly so a stale,
// role-mismatched session can actually be cleared before the user lands
// back on `/login`.
export async function GET(request: NextRequest) {
  await destroySession();
  const to = request.nextUrl.searchParams.get("to") ?? "/login";
  // Guard against this being used as an open redirect: only allow same-origin,
  // path-relative destinations.
  const safeTo = to.startsWith("/") && !to.startsWith("//") ? to : "/login";
  return NextResponse.redirect(new URL(safeTo, request.url));
}
