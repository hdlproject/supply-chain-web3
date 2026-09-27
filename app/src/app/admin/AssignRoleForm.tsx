"use client";

import { useActionState } from "react";

import { initialActionState } from "@/lib/action-state";

import { assignRoleAction } from "./actions";

export function AssignRoleForm() {
  const [state, formAction, pending] = useActionState(assignRoleAction, initialActionState);

  return (
    <form action={formAction}>
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
      {state.error ? <div className="field-error">{state.error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Assigning…" : "Assign role"}
      </button>
    </form>
  );
}
