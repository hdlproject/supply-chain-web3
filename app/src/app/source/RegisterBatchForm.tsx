"use client";

import { useActionState } from "react";

import { initialActionState } from "@/lib/action-state";

import { registerBatchAction } from "./actions";

export function RegisterBatchForm() {
  const [state, formAction, pending] = useActionState(registerBatchAction, initialActionState);

  return (
    <form action={formAction}>
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
      {state.error ? <div className="field-error">{state.error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Registering…" : "Register batch"}
      </button>
    </form>
  );
}
