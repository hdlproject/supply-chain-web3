import Link from "next/link";

import { logoutAction } from "@/app/login/actions";
import { clusterLabel } from "@/lib/cluster";
import type { DemoRole } from "@/lib/demo-accounts";
import { getRpcUrl } from "@/lib/program";

import { LogOutIcon } from "./icons";
import { LogoMark, Wordmark } from "./Logo";
import { NavLinks } from "./NavLinks";
import { WalletChip } from "./WalletChip";

// Rendered once from the root layout (see layout.tsx) so it persists across
// navigations instead of re-mounting — and flashing — on every page.
export function NavBar({ roles, wallet }: { roles: DemoRole[]; wallet: string }) {
  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/" className="brand">
            <LogoMark />
            <span>
              <Wordmark />
            </span>
          </Link>

          <NavLinks roles={roles} variant="header" />

          <div className="header-right">
            <span className="net-pill" title={getRpcUrl()}>
              <span className="live-dot" />
              <span className="net-name">{clusterLabel(getRpcUrl())}</span>
            </span>
            <WalletChip address={wallet} />
            <form action={logoutAction}>
              <button type="submit" className="icon-btn" aria-label="Sign out" title="Sign out">
                <LogOutIcon />
              </button>
            </form>
          </div>
        </div>
      </header>
      <NavLinks roles={roles} variant="tabbar" />
    </>
  );
}
