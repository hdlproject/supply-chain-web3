"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import type { DemoRole } from "@/lib/demo-accounts";
import { useWalletSignIn } from "@/lib/use-wallet-sign-in";

/**
 * No role has a disposable demo keypair — every role's actual authority is
 * on-chain (see guard.ts's resolveRoles), so this is a one-click shortcut
 * over the same real-wallet flow LoginForm uses: sign in with whatever
 * wallet is already connected, or open the wallet picker first if nothing
 * is connected yet, then sign in automatically once it connects. The
 * labeled role is just a hint to the user about which wallet to connect —
 * the backend determines the real role(s) from on-chain state regardless
 * of which button was clicked.
 */
export function DemoLoginButton({ role, description }: { role: DemoRole; description: string }) {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { signIn, error, pending } = useWalletSignIn();
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current && connected) {
      requested.current = false;
      void signIn(role);
    }
  }, [connected, signIn, role]);

  const handleClick = () => {
    if (connected) {
      void signIn(role);
      return;
    }
    requested.current = true;
    setVisible(true);
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
