"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { useToast } from "@/components/Toast";
import { useWalletGatedAction } from "@/lib/use-wallet-gated-action";

import { logMovement } from "./actions";

export function LogMovementForm({
  batches,
  selectedBatch,
  onSelectBatch,
}: {
  batches: { value: string; label: string }[];
  selectedBatch: string;
  onSelectBatch: (value: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { publicKey } = useWallet();
  const formRef = useRef<HTMLFormElement>(null);
  const [stopType, setStopType] = useState<"transit" | "warehouse">("transit");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = useWalletGatedAction<FormData>(async (wallet, formData) => {
    setPending(true);
    setError(null);
    const isTransit = stopType === "transit";
    const vehicleId = String(formData.get("vehicleId") ?? "").trim();
    const fromLocation = String(formData.get("fromLocation") ?? "").trim();
    const toLocation = String(formData.get("toLocation") ?? "").trim();
    const result = await logMovement(
      wallet,
      selectedBatch,
      isTransit,
      vehicleId,
      fromLocation,
      toLocation,
    );
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    formRef.current?.reset();
    toast.success(isTransit ? "Transit movement logged" : "Warehouse stop logged");
    router.refresh();
  });

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="field">
        <label htmlFor="batchId">Batch</label>
        <Select
          id="batchId"
          value={selectedBatch}
          onChange={onSelectBatch}
          options={batches}
          placeholder={batches.length === 0 ? "No open batches" : "Select a batch…"}
        />
      </div>

      <div className="field">
        <span className="label">Stop type</span>
        <div className="seg" role="group" aria-label="Stop type">
          <button
            type="button"
            className={stopType === "transit" ? "active" : ""}
            aria-pressed={stopType === "transit"}
            onClick={() => setStopType("transit")}
          >
            Transit
          </button>
          <button
            type="button"
            className={stopType === "warehouse" ? "active" : ""}
            aria-pressed={stopType === "warehouse"}
            onClick={() => setStopType("warehouse")}
          >
            Warehouse stop
          </button>
        </div>
        <p className="field-hint">
          The courier is always whoever&apos;s signed in; transit additionally records a vehicle.
        </p>
      </div>

      <div className="field">
        <label htmlFor="courierId">Courier (your connected wallet)</label>
        <input
          id="courierId"
          className="mono"
          type="text"
          value={publicKey ? publicKey.toBase58() : "Connect a wallet first"}
          disabled
          readOnly
        />
      </div>

      {stopType === "transit" ? (
        <div className="field">
          <label htmlFor="vehicleId">Vehicle ID</label>
          <input
            id="vehicleId"
            name="vehicleId"
            className="mono"
            type="text"
            maxLength={32}
            placeholder="VH-0092"
            autoComplete="off"
            required
          />
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="fromLocation">From location</label>
        <input
          id="fromLocation"
          name="fromLocation"
          type="text"
          maxLength={64}
          placeholder="Green Valley Farm, CA"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="toLocation">To location</label>
        <input
          id="toLocation"
          name="toLocation"
          type="text"
          maxLength={64}
          placeholder="Riverside Cold Storage, CA"
          required
        />
      </div>

      {error ? <div className="field-error">{error}</div> : null}
      <Button type="submit" block pending={pending} pendingLabel="Logging…" disabled={!selectedBatch}>
        Log movement
      </Button>
    </form>
  );
}
