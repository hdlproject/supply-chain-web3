"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

import { logMovement } from "./actions";

export function LogMovementForm({ batches }: { batches: { value: string; label: string }[] }) {
  const wallet = useAnchorWallet();
  const router = useRouter();
  const [stopType, setStopType] = useState<"transit" | "warehouse">("transit");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }
    setPending(true);
    setError(null);
    const batchId = String(formData.get("batchId") ?? "");
    const isTransit = stopType === "transit";
    const courierId = String(formData.get("courierId") ?? "").trim();
    const vehicleId = String(formData.get("vehicleId") ?? "").trim();
    const fromLocation = String(formData.get("fromLocation") ?? "").trim();
    const toLocation = String(formData.get("toLocation") ?? "").trim();
    const result = await logMovement(wallet, batchId, isTransit, courierId, vehicleId, fromLocation, toLocation);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <form action={handleSubmit}>
      <div className="field">
        <label htmlFor="batchId">Batch</label>
        <select id="batchId" name="batchId" required>
          {batches.length === 0 ? (
            <option value="">No open batches</option>
          ) : (
            batches.map((batch) => (
              <option key={batch.value} value={batch.value}>
                {batch.label}
              </option>
            ))
          )}
        </select>
      </div>

      <label>Stop type</label>
      <div className="seg" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className={stopType === "transit" ? "active" : ""}
          onClick={() => setStopType("transit")}
        >
          Transit
        </button>
        <button
          type="button"
          className={stopType === "warehouse" ? "active" : ""}
          onClick={() => setStopType("warehouse")}
        >
          Warehouse stop
        </button>
      </div>
      <div className="section-sub" style={{ marginTop: -4 }}>
        Transit shows courier &amp; vehicle fields; warehouse stop hides them.
      </div>

      {stopType === "transit" ? (
        <>
          <div className="field">
            <label htmlFor="courierId">Courier ID</label>
            <input id="courierId" name="courierId" className="mono" type="text" maxLength={32} placeholder="CR-4471" required />
          </div>
          <div className="field">
            <label htmlFor="vehicleId">Vehicle ID</label>
            <input id="vehicleId" name="vehicleId" className="mono" type="text" maxLength={32} placeholder="VH-0092" required />
          </div>
        </>
      ) : null}

      <div className="field">
        <label htmlFor="fromLocation">From location</label>
        <input id="fromLocation" name="fromLocation" type="text" maxLength={64} placeholder="Green Valley Farm, CA" required />
      </div>
      <div className="field">
        <label htmlFor="toLocation">To location</label>
        <input id="toLocation" name="toLocation" type="text" maxLength={64} placeholder="Riverside Cold Storage, CA" required />
      </div>

      {error ? <div className="field-error">{error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending || batches.length === 0}>
        {pending ? "Logging…" : "Log movement"}
      </button>
    </form>
  );
}
