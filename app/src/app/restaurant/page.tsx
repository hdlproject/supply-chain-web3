import type { Metadata } from "next";
import Link from "next/link";

import { fetchBatchesReceivedBy, fetchInTransitBatches } from "@/lib/accounts";
import { batchIdToHex, shortBatchId } from "@/lib/batch-id";
import { formatTimestamp } from "@/lib/format";
import { requireRole } from "@/lib/guard";
import { CardHeader } from "@/components/CardHeader";
import { ArrowRightIcon } from "@/components/icons";
import { PageHeader, Stats } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

import { ReceiveButton } from "./ReceiveButton";

export const metadata: Metadata = { title: "Restaurant" };

export default async function RestaurantPage() {
  const session = await requireRole("Restaurant");
  const [batches, received] = await Promise.all([
    fetchInTransitBatches(),
    fetchBatchesReceivedBy(session.wallet),
  ]);
  const receivedSorted = [...received].sort(
    (a, b) => b.account.deliveredAt.toNumber() - a.account.deliveredAt.toNumber(),
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Restaurant"
        title="Restaurant dashboard"
        description="Confirm deliveries as they arrive and keep a record of everything you've received."
      />

      <Stats
        items={[
          { label: "Awaiting receipt", value: batches.length, tone: "amber" },
          { label: "Received", value: received.length, tone: "accent" },
        ]}
      />

      <div className="stack">
        <div className="card">
          <CardHeader
            title="Awaiting receipt"
            call="receive_at_restaurant()"
            description="Batches currently in transit. Receiving one marks it delivered on-chain."
          />
          {batches.length === 0 ? (
            <div className="empty-state">Nothing awaiting receipt right now.</div>
          ) : (
            <div className="table-wrap">
              <table className="table-responsive">
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th>Products</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(({ publicKey, account }) => {
                    const hexId = batchIdToHex(Uint8Array.from(account.batchId));
                    return (
                      <tr key={publicKey.toBase58()}>
                        <td data-label="Batch ID" className="mono">
                          {shortBatchId(hexId)}
                        </td>
                        <td data-label="Products">
                          {account.lineItemCount} product{account.lineItemCount === 1 ? "" : "s"}
                        </td>
                        <td data-label="Status">
                          <StatusBadge status={account.status} />
                        </td>
                        <td className="cell-action">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <Link href={`/batch/${hexId}`} className="row-link">
                              View
                            </Link>
                            <ReceiveButton batchIdHex={hexId} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <CardHeader title="Received" description="Batches this wallet has already received." />
          {receivedSorted.length === 0 ? (
            <div className="empty-state">Nothing received yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="table-responsive">
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th>Products</th>
                    <th>Received at</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {receivedSorted.map(({ publicKey, account }) => {
                    const hexId = batchIdToHex(Uint8Array.from(account.batchId));
                    return (
                      <tr key={publicKey.toBase58()}>
                        <td data-label="Batch ID" className="mono">
                          {shortBatchId(hexId)}
                        </td>
                        <td data-label="Products">
                          {account.lineItemCount} product{account.lineItemCount === 1 ? "" : "s"}
                        </td>
                        <td data-label="Received at">{formatTimestamp(account.deliveredAt)}</td>
                        <td className="cell-action">
                          <Link href={`/batch/${hexId}`} className="row-link">
                            View <ArrowRightIcon small />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
