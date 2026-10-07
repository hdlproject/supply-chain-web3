"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import { useWalletSignIn } from "@/lib/use-wallet-sign-in";

export function LoginForm() {
  const { connected } = useWallet();
  const { signIn, error, pending } = useWalletSignIn();

  return (
    <div className="field" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <WalletMultiButton />
      {error ? <div className="field-error">{error}</div> : null}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!connected || pending}
        onClick={signIn}
      >
        {pending ? "Signing in…" : "Sign in with wallet"}
      </button>
    </div>
  );
}
