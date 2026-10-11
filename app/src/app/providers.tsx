"use client";

import { useCallback } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { WalletError } from "@solana/wallet-adapter-base";

import { getRpcUrl } from "@/lib/program";

import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = getRpcUrl();

  // autoConnect silently retries whatever wallet was last selected
  // (including a real extension, not just our demo wallets) on every page
  // load. wallet-adapter-react's own source treats that failing as
  // expected and relies on this handler to absorb it -- without one, the
  // library's default fallback both dumps a confusing "Unexpected error
  // [object Object]" to the console AND, for a WalletNotReadyError, opens
  // a new tab to the wallet's install page. Neither is useful for a
  // background reconnect attempt the user didn't initiate.
  const onWalletError = useCallback((error: WalletError) => {
    console.warn("[wallet]", error.message || error);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect={true} onError={onWalletError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
