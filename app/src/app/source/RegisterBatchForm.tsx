"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";
import { PlusIcon } from "@/components/icons";
import { Select } from "@/components/Select";
import { useToast } from "@/components/Toast";
import { useWalletGatedAction } from "@/lib/use-wallet-gated-action";

import { registerBatch } from "./actions";
import type { ProductRow } from "./build-register-batch-instructions";

const EMPTY_ROW: ProductRow = { skuCode: "", name: "", quantity: "" };

const SOURCE_TYPE_OPTIONS = [
  { value: "Farmer", label: "Farmer" },
  { value: "Factory", label: "Factory" },
  { value: "TraditionalMarket", label: "Traditional market" },
  { value: "Supermarket", label: "Supermarket" },
];

export function RegisterBatchForm({
  products,
}: {
  products: { skuCode: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<ProductRow[]>([{ ...EMPTY_ROW }]);
  const [sourceType, setSourceType] = useState<
    "Farmer" | "Factory" | "TraditionalMarket" | "Supermarket"
  >("Farmer");
  // Which row's suggestion list is open -- a plain text input doubles as
  // the picker, so "open" just means "this row's input is focused and has
  // matches to show", not a separate selection mode.
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const updateRow = (index: number, patch: Partial<ProductRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const existingSkuCodes = new Set(products.map((p) => p.skuCode));
  const isNewSku = (skuCode: string) => {
    const trimmed = skuCode.trim();
    return trimmed !== "" && !existingSkuCodes.has(trimmed);
  };

  const matchesFor = (query: string) => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === "") return products;
    return products.filter(
      (p) => p.skuCode.toLowerCase().includes(trimmed) || p.name.toLowerCase().includes(trimmed),
    );
  };

  const pickProduct = (index: number, product: { skuCode: string; name: string }) => {
    updateRow(index, { skuCode: product.skuCode, name: "" });
    setOpenRow(null);
  };

  const addRow = () => {
    setRows((current) => [...current, { ...EMPTY_ROW }]);
  };

  const removeRow = (index: number) => {
    setRows((current) => current.filter((_, i) => i !== index));
  };

  const submit = useWalletGatedAction<void>(async (wallet) => {
    setPending(true);
    setError(null);
    const productCount = rows.length;
    const result = await registerBatch(wallet, sourceType, rows);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRows([{ ...EMPTY_ROW }]);
    toast.success(`Batch registered with ${productCount} product${productCount === 1 ? "" : "s"}`);
    router.refresh();
  });

  return (
    <div>
      <div className="field">
        <label htmlFor="sourceType">Source type</label>
        <Select
          id="sourceType"
          value={sourceType}
          onChange={(value) => setSourceType(value as typeof sourceType)}
          options={SOURCE_TYPE_OPTIONS}
        />
      </div>

      {rows.map((row, index) => {
        const matches = matchesFor(row.skuCode);
        return (
          <div key={index} className="line-item">
            <div className="line-item-head">
              <span>Product {index + 1}</span>
              {rows.length > 1 ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => removeRow(index)}
                  aria-label={`Remove product ${index + 1}`}
                >
                  Remove
                </button>
              ) : null}
            </div>

            <div className="field combobox">
              <label htmlFor={`skuCode-${index}`}>SKU</label>
              <input
                id={`skuCode-${index}`}
                className="mono"
                type="text"
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                placeholder="Search or type a new SKU…"
                value={row.skuCode}
                onChange={(e) => updateRow(index, { skuCode: e.target.value })}
                onFocus={() => setOpenRow(index)}
                onBlur={() => setOpenRow((current) => (current === index ? null : current))}
                required
              />
              {openRow === index && matches.length > 0 ? (
                <div className="combobox-menu">
                  {matches.map((p) => (
                    <button
                      key={p.skuCode}
                      type="button"
                      className="combobox-option"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickProduct(index, p);
                      }}
                    >
                      <span>{p.name}</span>
                      <span className="combobox-option-sku mono">{p.skuCode}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {isNewSku(row.skuCode) ? (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor={`name-${index}`}>New product name</label>
                <input
                  id={`name-${index}`}
                  type="text"
                  maxLength={64}
                  placeholder="e.g. Roma Tomatoes 1kg"
                  value={row.name}
                  onChange={(e) => updateRow(index, { name: e.target.value })}
                  required
                />
                <p className="field-hint">This SKU isn&apos;t in the catalog yet — it will be registered with the batch.</p>
              </div>
            ) : null}

            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor={`quantity-${index}`}>Quantity</label>
              <input
                id={`quantity-${index}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="0"
                value={row.quantity}
                onChange={(e) => updateRow(index, { quantity: e.target.value })}
                required
              />
            </div>
          </div>
        );
      })}

      <Button variant="outline" size="sm" onClick={addRow} style={{ marginBottom: 16 }}>
        <PlusIcon small /> Add another product
      </Button>

      {error ? <div className="field-error">{error}</div> : null}
      <Button block pending={pending} pendingLabel="Registering…" onClick={() => submit()}>
        Register batch
      </Button>
    </div>
  );
}
