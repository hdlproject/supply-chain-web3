"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { requestNonce, verifyWalletLogin } from "@/app/login/actions";
import type { DemoRole } from "@/lib/demo-accounts";

export function useWalletSignIn() {
  const { publicKey, signMessage } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // expectedRole, when given, makes sign-in fail unless the connected
  // wallet actually holds that specific role — so "Demo login as Source"
  // with a wallet that only holds Carrier is rejected, not silently signed
  // in and redirected somewhere else. Omit it (LoginForm's generic "Sign
  // in with wallet") to accept any wallet with at least one role.
  const signIn = useCallback(
    async (expectedRole?: DemoRole) => {
      if (!publicKey || !signMessage) {
        setError("Connect a wallet first.");
        return;
      }
      setPending(true);
      setError(null);
      try {
        const { token, message } = await requestNonce();
        const signature = await signMessage(new TextEncoder().encode(message));
        const result = await verifyWalletLogin(
          token,
          publicKey.toBase58(),
          Buffer.from(signature).toString("base64"),
          expectedRole,
        );
        if (result.error) {
          setError(result.error);
        }
      } catch {
        setError("Sign-in failed. Try again.");
      } finally {
        setPending(false);
      }
    },
    [publicKey, signMessage],
  );

  return { signIn, error, pending };
}
