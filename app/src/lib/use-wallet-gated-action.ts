"use client";

import { useEffect, useRef } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import type { SigningWallet } from "./program";

/**
 * Wraps an action that needs a live wallet signature (grant/revoke a role,
 * register a batch, log a movement, receive one). The session cookie only
 * proves a signature happened at login time — it says nothing about
 * whether the wallet-adapter connection is still live right now, and it
 * can drop (a hard refresh, autoConnect silently failing) on any page, not
 * just /login. If a wallet is already connected, this runs the action
 * immediately; otherwise it opens the wallet-connect modal and runs the
 * action automatically once a wallet connects, instead of dead-ending at
 * a "connect your wallet first" message with no way to do that here.
 */
export function useWalletGatedAction<T>(
  run: (wallet: SigningWallet, input: T) => void | Promise<void>,
): (input: T) => void {
  const wallet = useAnchorWallet();
  const { setVisible } = useWalletModal();
  const pending = useRef<{ input: T } | null>(null);
  const runRef = useRef(run);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    if (pending.current && wallet) {
      const { input } = pending.current;
      pending.current = null;
      void runRef.current(wallet, input);
    }
  }, [wallet]);

  return (input: T) => {
    if (wallet) {
      void run(wallet, input);
      return;
    }
    pending.current = { input };
    setVisible(true);
  };
}
