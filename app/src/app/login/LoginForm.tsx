"use client";

import { useActionState } from "react";

import { initialActionState } from "@/lib/action-state";

import { loginWithPassword } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginWithPassword, initialActionState);

  return (
    <form action={formAction}>
      <div className="field">
        <label htmlFor="username">Username</label>
        <input id="username" name="username" type="text" placeholder="e.g. source" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" placeholder="••••••••" required />
      </div>
      {state.error ? <div className="field-error">{state.error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
