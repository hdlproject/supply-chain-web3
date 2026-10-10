import Link from "next/link";
import type { PublicKey } from "@solana/web3.js";

import { logoutAction } from "@/app/login/actions";
import type { DemoRole } from "@/lib/demo-accounts";
import { roleHomePath } from "@/lib/demo-accounts";
import { shortWallet } from "@/lib/format";

import { RoleBadge } from "./RoleBadge";

export function NavBar({
  roles,
  activeRole,
  wallet,
}: {
  roles: DemoRole[];
  activeRole: DemoRole;
  wallet: PublicKey;
}) {
  return (
    <div className="navbar">
      <Link href="/" className="brand">
        <span className="dot" />
        ChainTrace
      </Link>
      <div className="right">
        {roles.map((role) => (
          <Link key={role} href={roleHomePath(role)}>
            <RoleBadge role={role} active={role === activeRole} />
          </Link>
        ))}
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
