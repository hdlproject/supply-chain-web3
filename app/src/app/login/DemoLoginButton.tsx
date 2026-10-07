"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import type { DemoRole } from "@/lib/demo-accounts";
import { demoWalletName } from "@/lib/demo-wallet-adapter";
import { useWalletSignIn } from "@/lib/use-wallet-sign-in";

export function DemoLoginButton({ role, description }: { role: DemoRole; description: string }) {
  const { select, connect, connected, wallet, connecting } = useWallet();
  const { signIn, error, pending } = useWalletSignIn();
  const name = demoWalletName(role);
  const requested = useRef(false);

  // select() just marks this adapter as "selected" in context; it doesn't
  // connect on its own since Providers sets autoConnect={false}. Connect
  // once the selection has taken effect, then sign in once connected.
  useEffect(() => {
    if (requested.current && wallet?.adapter.name === name && !connected && !connecting) {
      connect().catch(() => {
        requested.current = false;
      });
    }
  }, [wallet, name, connected, connecting, connect]);

  useEffect(() => {
    if (requested.current && connected && wallet?.adapter.name === name) {
      requested.current = false;
      void signIn();
    }
  }, [connected, wallet, name, signIn]);

  const handleClick = () => {
    requested.current = true;
    select(name);
  };

  return (
    <div>
      <button type="button" className="btn btn-outline btn-block" onClick={handleClick} disabled={pending}>
        <span>
          <span style={{ display: "block", fontWeight: 600 }}>
            {pending ? `Signing in as ${role}…` : `Demo login as ${role}`}
          </span>
          <span
            style={{ display: "block", fontSize: 12, color: "var(--muted)", fontWeight: 400, marginTop: 2 }}
          >
            {description}
          </span>
        </span>
        <span style={{ color: "var(--muted)" }}>→</span>
      </button>
      {error ? <div className="field-error">{error}</div> : null}
    </div>
  );
}
