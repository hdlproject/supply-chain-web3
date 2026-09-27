import Link from "next/link";
import type { PublicKey } from "@solana/web3.js";

import { logoutAction } from "@/app/login/actions";
import { shortWallet } from "@/lib/format";

import { RoleBadge } from "./RoleBadge";

export function NavBar({ role, wallet }: { role: string; wallet: PublicKey }) {
  return (
    <div className="navbar">
      <Link href="/" className="brand">
        <span className="dot" />
        ChainTrace
      </Link>
      <div className="right">
        <RoleBadge role={role} />
        <span className="wallet">{shortWallet(wallet)}</span>
        <form action={logoutAction}>
          <button type="submit" className="link-button">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
