"use client";

import Link from "next/link";
import { useState } from "react";

import { CardHeader } from "@/components/CardHeader";
import { ArrowRightIcon } from "@/components/icons";
import { MovementTimeline, type TimelineMovement } from "@/components/MovementTimeline";
import { StatusBadge } from "@/components/StatusBadge";
import { shortBatchId } from "@/lib/batch-id";
import { shortWalletString } from "@/lib/format";

import { LogMovementForm } from "./LogMovementForm";

export type SerializedRoute = {
  hexId: string;
  status: object;
  source: string;
  sourceType: object;
  createdAt: number;
  receivedBy: string | null;
  deliveredAt: number | null;
  movements: TimelineMovement[];
};

export function BatchRoutesPanel({
  batches,
  routes,
  colorEntries,
}: {
  batches: { value: string; label: string }[];
  routes: SerializedRoute[];
  colorEntries: [string, string][];
}) {
  const [selectedBatch, setSelectedBatch] = useState("");
  const colors = new Map(colorEntries);
  const visibleRoute = routes.find((route) => route.hexId === selectedBatch);

  return (
    <div className="layout-split">
      <div className="card">
        <CardHeader title="Log movement" call="log_movement(vehicle, from, to)" />
        <LogMovementForm batches={batches} selectedBatch={selectedBatch} onSelectBatch={setSelectedBatch} />
      </div>
      <div className="stack panel-wide">
        {colors.size > 1 ? (
          <div className="card">
            <CardHeader title="Couriers on these routes" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {[...colors.entries()].map(([wallet, color]) => (
                <span key={wallet} className="chip" style={{ borderLeft: `3px solid ${color}` }}>
                  {shortWalletString(wallet)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="card">
          <CardHeader
            title="Route"
            description={
              selectedBatch
                ? "Full route for the selected batch — every carrier's legs, not just yours."
                : "Pick a batch in the form to see its route."
            }
          />
          {!visibleRoute ? (
            <div className="empty-state">
              {selectedBatch ? "No movements logged on this batch yet." : "No batch selected."}
            </div>
          ) : (
            <div>
              <div
                style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}
              >
                <span className="mono">{shortBatchId(visibleRoute.hexId)}</span>
                <StatusBadge status={visibleRoute.status} />
                <Link href={`/batch/${visibleRoute.hexId}`} className="row-link" style={{ marginLeft: "auto" }}>
                  View batch <ArrowRightIcon small />
                </Link>
              </div>
              <MovementTimeline
                movements={visibleRoute.movements}
                batch={visibleRoute}
                carrierColors={colors}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
