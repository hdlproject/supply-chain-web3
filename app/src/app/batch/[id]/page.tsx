import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

import { fetchBatch, fetchLineItemsForBatch, fetchMovementsForBatch } from "@/lib/accounts";
import { hexToBatchId, shortBatchId } from "@/lib/batch-id";
import { formatTimestamp, sourceTypeLabel } from "@/lib/format";
import { requireSession } from "@/lib/guard";
import { batchPda, getReadProgram } from "@/lib/program";
import { AddressChip } from "@/components/AddressChip";
import { CardHeader } from "@/components/CardHeader";
import { ArrowLeftIcon } from "@/components/icons";
import { MovementTimeline } from "@/components/MovementTimeline";
import { Stats } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export const metadata: Metadata = { title: "Batch" };

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;

  let batchIdBytes: Uint8Array;
  try {
    batchIdBytes = hexToBatchId(id);
  } catch {
    notFound();
  }

  const batch = await fetchBatch(batchIdBytes);
  if (!batch) {
    notFound();
  }

  const [batchAddress] = batchPda(batchIdBytes);
  const movements = await fetchMovementsForBatch(batchAddress);
  const lineItems = await fetchLineItemsForBatch(batchAddress);
  const program = getReadProgram();
  const products = await Promise.all(
    lineItems.map((item) => program.account.product.fetchNullable(item.product)),
  );
  const isReceived = !batch.receivedBy.equals(PublicKey.default);
  const totalQuantity = lineItems.reduce((sum, item) => sum.add(item.quantity), new BN(0));

  return (
    <div className="page">
      <Link href="/" className="back-link">
        <ArrowLeftIcon small /> Back to dashboard
      </Link>

      <header className="page-header">
        <div>
          <div className="eyebrow">Batch</div>
          <h1 className="mono" style={{ letterSpacing: "-0.02em" }}>
            {shortBatchId(id)}
          </h1>
          <p className="page-header-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Full ID <AddressChip address={id} label="Batch ID" />
          </p>
        </div>
        <StatusBadge status={batch.status} />
      </header>

      <Stats
        items={[
          { label: "Products", value: lineItems.length, tone: "violet" },
          { label: "Total quantity", value: totalQuantity.toString(), tone: "cyan" },
          { label: "Movements", value: movements.length, tone: "amber" },
        ]}
      />

      <div className="layout-split">
        <div className="stack">
          <div className="card">
            <CardHeader title="Details" />
            <dl className="kv">
              <div>
                <dt>Source type</dt>
                <dd>{sourceTypeLabel(batch.sourceType)}</dd>
              </div>
              <div>
                <dt>Registered</dt>
                <dd>{formatTimestamp(batch.createdAt)}</dd>
              </div>
              <div className="span-2">
                <dt>Registered by</dt>
                <dd>
                  <AddressChip address={batch.source.toBase58()} label="Registered by" />
                </dd>
              </div>
              {isReceived ? (
                <>
                  <div className="span-2">
                    <dt>Received by</dt>
                    <dd>
                      <AddressChip address={batch.receivedBy.toBase58()} label="Received by" />
                    </dd>
                  </div>
                  <div className="span-2">
                    <dt>Delivered</dt>
                    <dd>{formatTimestamp(batch.deliveredAt)}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          </div>

          <div className="card">
            <CardHeader title="Products in this batch" />
            {lineItems.length === 0 ? (
              <div className="empty-state">No products on this batch.</div>
            ) : (
              <div className="table-wrap">
                <table className="table-responsive">
                  <thead>
                    <tr>
                      <th>SKU code</th>
                      <th>Name</th>
                      <th>Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, i) => (
                      <tr key={item.index}>
                        <td data-label="SKU code" className="mono">
                          {products[i]?.skuCode ?? "—"}
                        </td>
                        <td data-label="Name">{products[i]?.name ?? "—"}</td>
                        <td data-label="Quantity" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {item.quantity.toString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card panel-wide">
          <CardHeader
            title="Movement timeline"
            description="Every handoff recorded on-chain, oldest first."
          />
          <MovementTimeline
            movements={movements.map((m) => ({
              carrier: m.carrier.toBase58(),
              fromLocation: m.fromLocation,
              toLocation: m.toLocation,
              vehicleId: m.vehicleId ?? null,
              timestamp: m.timestamp.toNumber(),
            }))}
            batch={{
              source: batch.source.toBase58(),
              sourceType: batch.sourceType,
              createdAt: batch.createdAt.toNumber(),
              receivedBy: isReceived ? batch.receivedBy.toBase58() : null,
              deliveredAt: isReceived ? batch.deliveredAt.toNumber() : null,
            }}
          />
        </div>
      </div>
    </div>
  );
}
