"use client";

import { useActionState, useState } from "react";

import { initialActionState } from "@/lib/action-state";

import { logMovementAction } from "./actions";

export function LogMovementForm({ batches }: { batches: { value: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(logMovementAction, initialActionState);
  const [stopType, setStopType] = useState<"transit" | "warehouse">("transit");

  return (
    <form action={formAction}>
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
      <input type="hidden" name="stopType" value={stopType} />
      <div className="section-sub" style={{ marginTop: -4 }}>
        Transit shows courier &amp; vehicle fields; warehouse stop hides them.
      </div>

      {stopType === "transit" ? (
        <>
          <div className="field">
            <label htmlFor="courierId">Courier ID</label>
            <input
              id="courierId"
              name="courierId"
              className="mono"
              type="text"
              maxLength={32}
              placeholder="CR-4471"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="vehicleId">Vehicle ID</label>
            <input
              id="vehicleId"
              name="vehicleId"
              className="mono"
              type="text"
              maxLength={32}
              placeholder="VH-0092"
              required
            />
          </div>
        </>
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

      {state.error ? <div className="field-error">{state.error}</div> : null}
      <button
        type="submit"
        className="btn btn-primary btn-block"
        disabled={pending || batches.length === 0}
      >
        {pending ? "Logging…" : "Log movement"}
      </button>
    </form>
  );
}
