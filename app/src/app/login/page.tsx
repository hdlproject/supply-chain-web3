import { redirect } from "next/navigation";
import { PublicKey } from "@solana/web3.js";

import { resolveHomePath } from "@/lib/guard";
import { getSession } from "@/lib/session";
import type { DemoRole } from "@/lib/demo-accounts";

import { DemoLoginButton } from "./DemoLoginButton";
import { LoginForm } from "./LoginForm";

const DEMO_ROLES: { role: DemoRole; description: string }[] = [
  { role: "Admin", description: "Grant & revoke roles · view every batch & movement" },
  { role: "Source", description: "Register new batches" },
  { role: "Carrier", description: "Log movements in transit" },
  { role: "Restaurant", description: "Receive incoming batches" },
];

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(await resolveHomePath(new PublicKey(session.wallet)));
  }

  return (
    <div className="login-shell">
      <div className="login-brand">
        <span
          style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--clay)" }}
        />
        ChainTrace
      </div>
      <div className="login-sub">
        Restaurant Ingredient Supply Chain — sign in with a wallet
      </div>
      <div className="login-columns">
        <div className="card">
          <div className="section-title">Sign in</div>
          <div className="section-sub">
            Connect a wallet and sign a login message. Your on-chain role is looked up
            automatically — no password.
          </div>
          <LoginForm />
        </div>
        <div className="card">
          <div className="section-title">Demo login</div>
          <div className="section-sub">
            One click — connects a demo wallet for that role and signs you in. Only available
            against localnet.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {DEMO_ROLES.map(({ role, description }) => (
              <DemoLoginButton role={role} description={description} key={role} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
