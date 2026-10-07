import { NextRequest, NextResponse } from "next/server";

import { DEMO_ACCOUNTS, loadKeypair } from "@/lib/demo-accounts";
import { getRpcUrl, isLocalnetRpc } from "@/lib/program";

export async function GET(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_WALLETS !== "true" || !isLocalnetRpc(getRpcUrl())) {
    return NextResponse.json({ error: "Demo wallets are disabled" }, { status: 404 });
  }

  const role = request.nextUrl.searchParams.get("role");
  const account = DEMO_ACCOUNTS.find((candidate) => candidate.role === role);
  if (!account) {
    return NextResponse.json({ error: "Unknown demo role" }, { status: 400 });
  }

  try {
    const keypair = loadKeypair(account);
    return NextResponse.json({ secretKey: Array.from(keypair.secretKey) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load demo keypair" },
      { status: 500 },
    );
  }
}
