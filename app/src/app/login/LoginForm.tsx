"use client";

import { useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/Button";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useWalletSignIn } from "@/lib/use-wallet-sign-in";

export function LoginForm() {
  const { connected } = useWallet();
  const { signIn, error, pending } = useWalletSignIn();

  return (
    <div className="stack-sm">
      <WalletConnectButton />
      {error ? <div className="field-error">{error}</div> : null}
      <Button
        block
        disabled={!connected}
        pending={pending}
        pendingLabel="Waiting for signature…"
        onClick={() => signIn()}
      >
        Sign in with wallet
      </Button>
    </div>
  );
}
