"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useWalletGatedAction } from "@/lib/use-wallet-gated-action";

import { registerProduct } from "./actions";

export function RegisterProductForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = useWalletGatedAction<FormData>(async (wallet, formData) => {
    setPending(true);
    setError(null);
    const skuCode = String(formData.get("skuCode") ?? "");
    const name = String(formData.get("name") ?? "");
    const result = await registerProduct(wallet, skuCode, name);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  });

  return (
    <form action={handleSubmit}>
      <div className="field">
        <label htmlFor="skuCode">SKU code</label>
        <input
          id="skuCode"
          name="skuCode"
          className="mono"
          type="text"
          maxLength={32}
          placeholder="e.g. TOMATO-ROMA-1KG"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" maxLength={64} placeholder="e.g. Roma Tomatoes 1kg" required />
      </div>
      {error ? <div className="field-error">{error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Registering…" : "Register product"}
      </button>
    </form>
  );
}
