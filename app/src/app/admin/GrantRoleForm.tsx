"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { useToast } from "@/components/Toast";
import { useWalletGatedAction } from "@/lib/use-wallet-gated-action";

import { grantRole } from "./actions";

const ROLE_OPTIONS = [
  { value: "Admin", label: "Admin" },
  { value: "Source", label: "Source" },
  { value: "Carrier", label: "Carrier" },
  { value: "Restaurant", label: "Restaurant" },
];

export function GrantRoleForm() {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState<"Admin" | "Source" | "Carrier" | "Restaurant">("Source");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = useWalletGatedAction<FormData>(async (wallet, formData) => {
    setPending(true);
    setError(null);
    const walletInput = String(formData.get("wallet") ?? "");
    const result = await grantRole(wallet, walletInput, role);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    formRef.current?.reset();
    toast.success(`${role} role granted`);
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
        <label htmlFor="grant-wallet">Wallet address</label>
        <input
          id="grant-wallet"
          name="wallet"
          className="mono"
          type="text"
          placeholder="Paste a Solana address"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="grant-role">Role</label>
        <Select
          id="grant-role"
          value={role}
          onChange={(value) => setRole(value as typeof role)}
          options={ROLE_OPTIONS}
        />
      </div>
      {error ? <div className="field-error">{error}</div> : null}
      <Button type="submit" block pending={pending} pendingLabel="Granting…">
        Grant role
      </Button>
    </form>
  );
}
