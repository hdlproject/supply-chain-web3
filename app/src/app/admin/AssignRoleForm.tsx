"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

import { assignRole } from "./actions";

export function AssignRoleForm() {
  const wallet = useAnchorWallet();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }
    setPending(true);
    setError(null);
    const walletInput = String(formData.get("wallet") ?? "");
    const role = String(formData.get("role") ?? "") as "Source" | "Carrier" | "Restaurant";
    const result = await assignRole(wallet, walletInput, role);
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
        <label htmlFor="wallet">Wallet address</label>
        <input
          id="wallet"
          name="wallet"
          className="mono"
          type="text"
          placeholder="9pL4...c22Z"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="role">Role</label>
        <select id="role" name="role" required defaultValue="Source">
          <option value="Source">Source</option>
          <option value="Carrier">Carrier</option>
          <option value="Restaurant">Restaurant</option>
        </select>
      </div>
      {error ? <div className="field-error">{error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Assigning…" : "Assign role"}
      </button>
    </form>
  );
}
