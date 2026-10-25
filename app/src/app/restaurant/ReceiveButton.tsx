"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { useWalletGatedAction } from "@/lib/use-wallet-gated-action";

import { receiveBatch } from "./actions";

export function ReceiveButton({ batchIdHex }: { batchIdHex: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const handleClick = useWalletGatedAction<void>(async (wallet) => {
    setPending(true);
    const result = await receiveBatch(wallet, batchIdHex);
    setPending(false);
    if (result.error) {
      // A toast rather than inline text: this button lives in a table row,
      // where a multi-line error would blow out the row's layout.
      toast.error(result.error);
      return;
    }
    toast.success("Batch received");
    router.refresh();
  });

  return (
    <Button size="sm" pending={pending} pendingLabel="Receiving…" onClick={() => handleClick()}>
      Receive
    </Button>
  );
}
