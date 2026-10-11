"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useWalletGatedAction } from "@/lib/use-wallet-gated-action";

import { grantRole } from "./actions";

export function GrantRoleForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = useWalletGatedAction<FormData>(async (wallet, formData) => {
    setPending(true);
    setError(null);
    const walletInput = String(formData.get("wallet") ?? "");
    const role = String(formData.get("role") ?? "") as
      | "Admin"
      | "Source"
      | "Carrier"
      | "Restaurant";
    const result = await grantRole(wallet, walletInput, role);
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
        <label htmlFor="grant-wallet">Wallet address</label>
        <input
          id="grant-wallet"
          name="wallet"
          className="mono"
          type="text"
          placeholder="9pL4...c22Z"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="grant-role">Role</label>
        <select id="grant-role" name="role" required defaultValue="Source">
          <option value="Admin">Admin</option>
          <option value="Source">Source</option>
          <option value="Carrier">Carrier</option>
          <option value="Restaurant">Restaurant</option>
        </select>
      </div>
      {error ? <div className="field-error">{error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Granting…" : "Grant role"}
      </button>
    </form>
  );
}
