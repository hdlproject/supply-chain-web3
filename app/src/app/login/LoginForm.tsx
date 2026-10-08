"use client";

import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";

import { useWalletSignIn } from "@/lib/use-wallet-sign-in";

// WalletMultiButton's rendered icon depends on which wallet was previously
// selected, read from localStorage inside a useState lazy initializer --
// that runs on the client's first render too (the one React reconciles
// against the server-rendered HTML), but localStorage doesn't exist on the
// server. Server always renders icon-less "Select Wallet"; the client's
// first render can render WITH an icon if a wallet name was persisted,
// causing a hydration mismatch. Skipping SSR for this component (the fix
// Solana's own Next.js starter uses) sidesteps the mismatch entirely by
// rendering nothing here until after mount.
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

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
