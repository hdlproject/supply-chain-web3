"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { useWalletGatedAction } from "@/lib/use-wallet-gated-action";

import { registerProduct } from "./actions";

export function RegisterProductForm({ existingSkuCodes }: { existingSkuCodes: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [skuCode, setSkuCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const trimmedSkuCode = skuCode.trim();
  const isDuplicate = trimmedSkuCode !== "" && existingSkuCodes.includes(trimmedSkuCode);
  const isNewSku = trimmedSkuCode !== "" && !isDuplicate;

  const handleSubmit = useWalletGatedAction<FormData>(async (wallet, formData) => {
    setPending(true);
    setError(null);
    const skuCodeValue = String(formData.get("skuCode") ?? "");
    const name = String(formData.get("name") ?? "");
    const result = await registerProduct(wallet, skuCodeValue, name);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSkuCode("");
    formRef.current?.reset();
    toast.success(`Product ${skuCodeValue.trim()} registered`);
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
        <label htmlFor="skuCode">SKU code</label>
        <input
          id="skuCode"
          name="skuCode"
          className="mono"
          type="text"
          maxLength={32}
          placeholder="e.g. TOMATO-ROMA-1KG"
          autoComplete="off"
          spellCheck={false}
          value={skuCode}
          onChange={(e) => setSkuCode(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" maxLength={64} placeholder="e.g. Roma Tomatoes 1kg" required />
      </div>
      {isDuplicate ? <div className="field-error">This SKU code is already registered.</div> : null}
      {error ? <div className="field-error">{error}</div> : null}
      <Button type="submit" block pending={pending} pendingLabel="Registering…" disabled={!isNewSku}>
        Register product
      </Button>
    </form>
  );
}
