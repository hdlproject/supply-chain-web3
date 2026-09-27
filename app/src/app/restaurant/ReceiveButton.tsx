"use client";

import { useActionState } from "react";

import { initialActionState } from "@/lib/action-state";

import { receiveAction } from "./actions";

export function ReceiveButton({ batchIdHex }: { batchIdHex: string }) {
  const [state, formAction, pending] = useActionState(receiveAction, initialActionState);

  return (
    <form action={formAction} style={{ display: "inline" }}>
      <input type="hidden" name="batchId" value={batchIdHex} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Receiving…" : "Receive"}
      </button>
      {state.error ? (
        <div className="field-error" style={{ marginTop: 6 }}>
          {state.error}
        </div>
      ) : null}
    </form>
  );
}
