import { fetchAllBatches, fetchMovementsByCarrier } from "@/lib/accounts";
import { batchIdToHex, shortBatchId } from "@/lib/batch-id";
import { formatTimestamp } from "@/lib/format";
import { requireRole } from "@/lib/guard";
import { NavBar } from "@/components/NavBar";

import { LogMovementForm } from "./LogMovementForm";

export default async function CarrierPage() {
  const session = await requireRole("Carrier");
  const [allBatches, movements] = await Promise.all([
    fetchAllBatches(),
    fetchMovementsByCarrier(session.wallet),
  ]);

  const eligibleBatches = allBatches
    .filter((entry) => !("delivered" in entry.account.status))
    .map((entry) => {
      const hexId = batchIdToHex(Uint8Array.from(entry.account.batchId));
      return { value: hexId, label: `${shortBatchId(hexId)} — ${entry.account.lineItemCount} item${entry.account.lineItemCount === 1 ? "" : "s"}` };
    });

  const sortedMovements = movements
    .slice()
    .sort((a, b) => b.account.timestamp.toNumber() - a.account.timestamp.toNumber());

  return (
    <div>
      <NavBar roles={session.roles} activeRole="Carrier" wallet={session.wallet} />
      <div className="page layout-split">
        <div className="panel-narrow card">
          <div className="section-title">Log movement</div>
          <div className="section-sub">log_movement(courier_id, vehicle_id, from, to)</div>
          <LogMovementForm batches={eligibleBatches} />
        </div>
        <div className="panel-wide card">
          <div className="section-title">Movements you&apos;ve logged</div>
          <div className="section-sub">Only this account&apos;s entries</div>
          {sortedMovements.length === 0 ? (
            <div className="empty-state">No movements logged yet.</div>
          ) : (
            <div className="timeline">
              <div className="timeline-line" />
              {sortedMovements.map(({ publicKey, account }) => (
                <div className="timeline-item" key={publicKey.toBase58()}>
                  <div className="timeline-dot" />
                  <div className="timeline-route">
                    {account.fromLocation} → {account.toLocation}
                  </div>
                  {account.courierId && account.vehicleId ? (
                    <div className="timeline-meta">
                      <span className="chip">courier {account.courierId}</span>
                      <span className="chip">vehicle {account.vehicleId}</span>
                    </div>
                  ) : null}
                  <div className="timeline-meta">{formatTimestamp(account.timestamp)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
