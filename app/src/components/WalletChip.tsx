"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

import { shortWalletString } from "@/lib/format";

import { WalletIcon } from "./icons";

// Shows the signed-in wallet and, importantly, whether the browser's wallet
// connection is actually live right now. The session cookie only proves a
// signature happened at login — every write action also needs a connected
// wallet, which can silently drop (refresh, extension locked). An amber dot
// that opens the connect modal beats finding that out at submit time.
export function WalletChip({ address }: { address: string }) {
  const { publicKey, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  // false during SSR and the hydration render, true afterwards — the
  // idiomatic way to know "we're on the client now" without an effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const live = publicKey?.toBase58() === address;
  // Wallet state only exists client-side after localStorage + autoConnect
  // settle, so avoid flashing a false "disconnected" warning before then.
  const status = !mounted || connecting ? "idle" : live ? "ok" : "warn";

  const handleClick = async () => {
    if (status === "warn") {
      setVisible(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard may be blocked; nothing useful to do.
    }
  };

  const title =
    status === "warn"
      ? "Wallet not connected — click to connect"
      : status === "idle"
        ? address
        : `${address} — click to copy`;

  return (
    <button type="button" className="wallet-chip" onClick={handleClick} title={title}>
      <span className={`live-dot${status === "warn" ? " is-warn" : status === "idle" ? " is-idle" : ""}`} />
      <WalletIcon small />
      <span className="wallet-chip-text">{copied ? "Copied" : shortWalletString(address)}</span>
    </button>
  );
}
