"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal, WalletIcon } from "@solana/wallet-adapter-react-ui";

/**
 * A from-scratch replacement for @solana/wallet-adapter-react-ui's
 * WalletMultiButton (same markup/CSS classes, so it looks identical) with
 * one behavior change: "Change wallet" reloads the page instead of
 * reopening the wallet-selection modal.
 *
 * Why: this library version never detects an account switched inside an
 * already-connected extension (Phantom et al.) — confirmed against the
 * real extension across three different in-app detection attempts (a
 * standard:events listener, polling the wallet's own `accounts` property,
 * and an unconditional disconnect+reconnect), none of which picked up the
 * new account; only a full page reload does, since that re-runs
 * autoConnect's connect() handshake from scratch. The stock
 * WalletMultiButton's "Change wallet" item is hardcoded to open the modal
 * instead (see its source — no prop exists to override just that one
 * action), so it's reimplemented here rather than patched. Switching to a
 * genuinely different wallet extension still works: Disconnect, then the
 * button reopens the picker modal as before.
 *
 * Rendered only client-side via next/dynamic(ssr:false) in
 * WalletConnectButton.tsx — wallet state depends on localStorage (which
 * wallet was last selected), unavailable on the server and on the client's
 * very first render too, so this component is never asked to SSR at all.
 */
export function WalletConnectButtonImpl() {
  const { connect, connected, connecting, disconnect, publicKey, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const node = ref.current;
      if (!node || node.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, []);

  const label = useMemo(() => {
    if (publicKey) {
      const base58 = publicKey.toBase58();
      return `${base58.slice(0, 4)}..${base58.slice(-4)}`;
    }
    if (connecting) return "Connecting ...";
    if (wallet) return "Connect";
    return "Select Wallet";
  }, [publicKey, connecting, wallet]);

  const handleMainClick = () => {
    if (connected) {
      setMenuOpen(true);
      return;
    }
    if (wallet) {
      connect().catch(() => {
        // Silently caught -- surfaced by the context's own onError handler.
      });
      return;
    }
    setVisible(true);
  };

  return (
    <div className="wallet-adapter-dropdown">
      <button
        className="wallet-adapter-button wallet-adapter-button-trigger"
        type="button"
        aria-expanded={menuOpen}
        style={{ pointerEvents: menuOpen ? "none" : "auto" }}
        onClick={handleMainClick}
      >
        {wallet ? (
          <i className="wallet-adapter-button-start-icon">
            <WalletIcon wallet={wallet} />
          </i>
        ) : null}
        {label}
      </button>
      <ul
        aria-label="dropdown-list"
        className={`wallet-adapter-dropdown-list ${menuOpen ? "wallet-adapter-dropdown-list-active" : ""}`}
        ref={ref}
        role="menu"
      >
        {publicKey ? (
          <li
            className="wallet-adapter-dropdown-list-item"
            role="menuitem"
            onClick={() => {
              void navigator.clipboard.writeText(publicKey.toBase58()).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 400);
              });
            }}
          >
            {copied ? "Copied" : "Copy address"}
          </li>
        ) : null}
        <li
          className="wallet-adapter-dropdown-list-item"
          role="menuitem"
          onClick={() => {
            window.location.reload();
          }}
        >
          Change wallet
        </li>
        {connected ? (
          <li
            className="wallet-adapter-dropdown-list-item"
            role="menuitem"
            onClick={() => {
              disconnect().catch(() => {
                // Silently caught -- surfaced by the context's own onError handler.
              });
              setMenuOpen(false);
            }}
          >
            Disconnect
          </li>
        ) : null}
      </ul>
    </div>
  );
}
