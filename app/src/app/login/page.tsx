import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicKey } from "@solana/web3.js";

import { AlertIcon, KeyIcon, LinkIcon, RoleIcon, ShieldIcon } from "@/components/icons";
import { LogoMark, Wordmark } from "@/components/Logo";
import { resolveHomePath } from "@/lib/guard";
import { getSession } from "@/lib/session";
import type { DemoRole } from "@/lib/demo-accounts";

import { DemoLoginButton } from "./DemoLoginButton";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const DEMO_ROLES: { role: DemoRole; description: string }[] = [
  { role: "Admin", description: "Grant & revoke roles, monitor every batch" },
  { role: "Source", description: "Register new batches" },
  { role: "Carrier", description: "Log movements in transit" },
  { role: "Restaurant", description: "Receive incoming batches" },
];

const CHAIN_STEPS: DemoRole[] = ["Source", "Carrier", "Restaurant"];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) {
    redirect(await resolveHomePath(new PublicKey(session.wallet)));
  }
  const { error } = await searchParams;

  return (
    <main className="login-shell">
      <section className="hero">
        <div className="brand">
          <LogoMark />
          <span>
            <Wordmark />
          </span>
        </div>
        <h1>
          Every ingredient, <span className="gradient-text">traced</span> from source to plate.
        </h1>
        <p className="hero-lead">
          ChainTrace records each batch&apos;s journey on Solana — who registered it, who moved it,
          who received it — so a restaurant can verify exactly what&apos;s on the plate.
        </p>

        <ul className="feature-list">
          <li>
            <span className="feature-icon">
              <LinkIcon />
            </span>
            <div>
              <strong>Verifiable history</strong>
              Every handoff is an on-chain record nobody can quietly edit.
            </div>
          </li>
          <li>
            <span className="feature-icon">
              <ShieldIcon />
            </span>
            <div>
              <strong>Role-based access</strong>
              Sources, carriers and restaurants only do what the chain allows them to.
            </div>
          </li>
          <li>
            <span className="feature-icon">
              <KeyIcon />
            </span>
            <div>
              <strong>Sign in with your wallet</strong>
              No password to leak — just a signed message.
            </div>
          </li>
        </ul>

        <div className="chain-viz" aria-hidden="true">
          {CHAIN_STEPS.flatMap((role, index) => [
            <div key={role} className="chain-node">
              <RoleIcon role={role} small />
              {role}
            </div>,
            index < CHAIN_STEPS.length - 1 ? (
              <div key={`${role}-link`} className="chain-link" />
            ) : null,
          ])}
        </div>
      </section>

      <section className="card login-card">
        <h2 className="section-title">Sign in</h2>
        <p className="section-sub">
          Connect a wallet and sign a short message. Your on-chain roles are looked up
          automatically.
        </p>

        {error === "unauthorized" ? (
          <div className="notice" role="alert">
            <AlertIcon />
            <span>
              Your session expired or no longer has access to that page. Sign in again to continue.
            </span>
          </div>
        ) : null}

        <LoginForm />

        <div className="divider">or continue as a role</div>
        <div className="role-grid">
          {DEMO_ROLES.map(({ role, description }) => (
            <DemoLoginButton role={role} description={description} key={role} />
          ))}
        </div>
        <p className="field-hint" style={{ marginTop: 14 }}>
          Your wallet must hold the role you pick on-chain.
        </p>
      </section>
    </main>
  );
}
