"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useWalletGatedAction } from "@/lib/use-wallet-gated-action";

import { receiveBatch } from "./actions";

export function ReceiveButton({ batchIdHex }: { batchIdHex: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleClick = useWalletGatedAction<void>(async (wallet) => {
    setPending(true);
    setError(null);
    const result = await receiveBatch(wallet, batchIdHex);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  });

  return (
    <div style={{ display: "inline-block" }}>
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => handleClick()}>
        {pending ? "Receiving…" : "Receive"}
      </button>
      {error ? <div className="field-error" style={{ marginTop: 6 }}>{error}</div> : null}
    </div>
  );
}
