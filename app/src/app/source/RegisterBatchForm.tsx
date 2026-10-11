"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useWalletGatedAction } from "@/lib/use-wallet-gated-action";

import { registerBatch } from "./actions";

export function RegisterBatchForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = useWalletGatedAction<FormData>(async (wallet, formData) => {
    setPending(true);
    setError(null);
    const ingredientName = String(formData.get("ingredientName") ?? "").trim();
    const quantity = String(formData.get("quantity") ?? "").trim();
    const sourceType = String(formData.get("sourceType") ?? "") as
      | "Farmer"
      | "Factory"
      | "TraditionalMarket"
      | "Supermarket";
    const result = await registerBatch(wallet, ingredientName, quantity, sourceType);
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
        <label htmlFor="ingredientName">Ingredient name</label>
        <input
          id="ingredientName"
          name="ingredientName"
          type="text"
          maxLength={64}
          placeholder="e.g. Heirloom tomatoes"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="quantity">Quantity</label>
        <input id="quantity" name="quantity" type="number" min={0} step={1} placeholder="e.g. 240" required />
      </div>
      <div className="field">
        <label htmlFor="sourceType">Source type</label>
        <select id="sourceType" name="sourceType" required defaultValue="Farmer">
          <option value="Farmer">Farmer</option>
          <option value="Factory">Factory</option>
          <option value="TraditionalMarket">Traditional market</option>
          <option value="Supermarket">Supermarket</option>
        </select>
      </div>
      {error ? <div className="field-error">{error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Registering…" : "Register batch"}
      </button>
    </form>
  );
}
