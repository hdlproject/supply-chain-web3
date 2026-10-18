import { fetchInTransitBatches } from "@/lib/accounts";
import { batchIdToHex, shortBatchId } from "@/lib/batch-id";
import { requireRole } from "@/lib/guard";
import { NavBar } from "@/components/NavBar";
import { StatusBadge } from "@/components/StatusBadge";

import { ReceiveButton } from "./ReceiveButton";

export default async function RestaurantPage() {
  const session = await requireRole("Restaurant");
  const batches = await fetchInTransitBatches();

  return (
    <div>
      <NavBar roles={session.roles} activeRole="Restaurant" wallet={session.wallet} />
      <div className="page">
        <div className="card">
          <div className="section-title">Awaiting receipt</div>
          <div className="section-sub">
            Batches currently in transit · action calls receive_at_restaurant()
          </div>
          {batches.length === 0 ? (
            <div className="empty-state">Nothing awaiting receipt right now.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Batch ID</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(({ publicKey, account }) => {
                  const hexId = batchIdToHex(Uint8Array.from(account.batchId));
                  return (
                    <tr key={publicKey.toBase58()}>
                      <td className="mono">{shortBatchId(hexId)}</td>
                      <td>{account.lineItemCount} item{account.lineItemCount === 1 ? "" : "s"}</td>
                      <td>
                        <StatusBadge status={account.status} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <ReceiveButton batchIdHex={hexId} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
