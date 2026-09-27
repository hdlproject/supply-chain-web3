import { redirect } from "next/navigation";
import { PublicKey } from "@solana/web3.js";

import { resolveHomePath } from "@/lib/guard";
import { getSession } from "@/lib/session";
import type { DemoRole } from "@/lib/demo-accounts";

import { demoLoginAction } from "./actions";
import { LoginForm } from "./LoginForm";

const DEMO_ROLES: { role: DemoRole; description: string }[] = [
  { role: "Admin", description: "Assign roles · view every batch & movement" },
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
        Restaurant Ingredient Supply Chain — demo login (custodial keypair per account)
      </div>
      <div className="login-columns">
        <div className="card">
          <div className="section-title">Sign in</div>
          <div className="section-sub">Username + password. No wallet extension required.</div>
          <LoginForm />
        </div>
        <div className="card">
          <div className="section-title">Demo login</div>
          <div className="section-sub">
            One click — instantly authenticated as that role&apos;s pre-provisioned account.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {DEMO_ROLES.map(({ role, description }) => (
              <form action={demoLoginAction.bind(null, role)} key={role}>
                <button type="submit" className="btn btn-outline btn-block">
                  <span>
                    <span style={{ display: "block", fontWeight: 600 }}>
                      Demo login as {role}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12,
                        color: "var(--muted)",
                        fontWeight: 400,
                        marginTop: 2,
                      }}
                    >
                      {description}
                    </span>
                  </span>
                  <span style={{ color: "var(--muted)" }}>→</span>
                </button>
              </form>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
