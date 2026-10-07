"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { requestNonce, verifyWalletLogin } from "@/app/login/actions";

export function useWalletSignIn() {
  const { publicKey, signMessage } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const signIn = useCallback(async () => {
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
      );
      if (result.error) {
        setError(result.error);
      }
    } catch {
      setError("Sign-in failed. Try again.");
    } finally {
      setPending(false);
    }
  }, [publicKey, signMessage]);

  return { signIn, error, pending };
}
