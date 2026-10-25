"use client";

import { useEffect } from "react";

import { Button } from "@/components/Button";
import { AlertIcon } from "@/components/icons";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <div className="card" style={{ textAlign: "center", padding: "36px 28px" }}>
        <div
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 48,
            height: 48,
            marginBottom: 16,
            borderRadius: 14,
            color: "var(--danger)",
            background: "rgba(251, 113, 133, 0.1)",
            border: "1px solid rgba(251, 113, 133, 0.3)",
          }}
        >
          <AlertIcon />
        </div>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Couldn&apos;t load this page</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 22 }}>
          Something went wrong talking to the chain. If you&apos;re running locally, check that the
          validator is up and the program is deployed.
        </p>
        <Button onClick={reset}>Try again</Button>
        {error.digest ? (
          <p className="mono" style={{ marginTop: 18, fontSize: 12, color: "var(--text-dim)" }}>
            ref {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
