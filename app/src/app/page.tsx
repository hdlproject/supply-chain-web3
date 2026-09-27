import { redirect } from "next/navigation";
import { PublicKey } from "@solana/web3.js";

import { resolveHomePath } from "@/lib/guard";
import { getSession } from "@/lib/session";

export default async function RootPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  redirect(await resolveHomePath(new PublicKey(session.wallet)));
}
