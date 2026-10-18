"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useWalletGatedAction } from "@/lib/use-wallet-gated-action";

import { registerBatch } from "./actions";
import type { ProductRow } from "./build-register-batch-instructions";

const EMPTY_ROW: ProductRow = { skuCode: "", name: "", quantity: "" };

export function RegisterBatchForm({
  products,
}: {
  products: { skuCode: string; name: string }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ProductRow[]>([{ ...EMPTY_ROW }]);
  const [sourceType, setSourceType] = useState<
    "Farmer" | "Factory" | "TraditionalMarket" | "Supermarket"
  >("Farmer");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const updateRow = (index: number, patch: Partial<ProductRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const submit = useWalletGatedAction<void>(async (wallet) => {
    setPending(true);
    setError(null);
    const result = await registerBatch(wallet, sourceType, rows);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRows([{ ...EMPTY_ROW }]);
    router.refresh();
  });

  return (
    <div>
      <datalist id="existing-products">
        {products.map((p) => (
          <option key={p.skuCode} value={p.skuCode}>
            {p.name}
          </option>
        ))}
      </datalist>
      <div className="field">
        <label htmlFor="sourceType">Source type</label>
        <select
          id="sourceType"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
        >
          <option value="Farmer">Farmer</option>
          <option value="Factory">Factory</option>
          <option value="TraditionalMarket">Traditional market</option>
          <option value="Supermarket">Supermarket</option>
        </select>
      </div>

      {rows.map((row, index) => (
        <div key={index} className="field-grid" style={{ marginBottom: 12 }}>
          <div className="field">
            <label htmlFor={`skuCode-${index}`}>SKU code</label>
            <input
              id={`skuCode-${index}`}
              className="mono"
              type="text"
              maxLength={32}
              placeholder="existing or brand-new code"
              list="existing-products"
              value={row.skuCode}
              onChange={(e) => updateRow(index, { skuCode: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor={`name-${index}`}>Name (only needed for a brand-new SKU)</label>
            <input
              id={`name-${index}`}
              type="text"
              maxLength={64}
              placeholder="e.g. Roma Tomatoes 1kg"
              value={row.name}
              onChange={(e) => updateRow(index, { name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`quantity-${index}`}>Quantity</label>
            <input
              id={`quantity-${index}`}
              type="number"
              min={0}
              step={1}
              value={row.quantity}
              onChange={(e) => updateRow(index, { quantity: e.target.value })}
              required
            />
          </div>
          {rows.length > 1 ? (
            <button
              type="button"
              className="link-button"
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        className="btn btn-outline"
        onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}
        style={{ marginBottom: 12 }}
      >
        + Add another product
      </button>

      {error ? <div className="field-error">{error}</div> : null}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={pending}
        onClick={() => submit()}
      >
        {pending ? "Registering…" : "Register batch"}
      </button>
    </div>
  );
}
