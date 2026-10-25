"use client";

import { useEffect, useRef, useState } from "react";

import { shortWalletString } from "@/lib/format";

import { CheckIcon, CopyIcon } from "./icons";

// A truncated wallet/account address that copies the full value on click.
export function AddressChip({ address, label }: { address: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard can be blocked (insecure context, permissions); the full
      // address is still in the tooltip, so failing quietly is fine.
    }
  };

  return (
    <button
      type="button"
      className={`addr${copied ? " is-copied" : ""}`}
      onClick={copy}
      title={copied ? "Copied!" : `${address} — click to copy`}
      aria-label={`${label ?? "Address"} ${address}. Click to copy.`}
    >
      <span>{shortWalletString(address)}</span>
      {copied ? <CheckIcon small /> : <CopyIcon small />}
    </button>
  );
}
