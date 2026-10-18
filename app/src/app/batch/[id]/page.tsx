import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicKey } from "@solana/web3.js";

import { fetchBatch, fetchLineItemsForBatch, fetchMovementsForBatch } from "@/lib/accounts";
import { hexToBatchId, shortBatchId } from "@/lib/batch-id";
import { formatTimestamp, shortWallet, sourceTypeLabel } from "@/lib/format";
import { requireSession } from "@/lib/guard";
import { batchPda, getReadProgram } from "@/lib/program";
import { MovementTimeline } from "@/components/MovementTimeline";
import { StatusBadge } from "@/components/StatusBadge";

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
  const products = await Promise.all(
    lineItems.map((item) => getReadProgram().account.product.fetchNullable(item.product)),
  );
  const isReceived = !batch.receivedBy.equals(PublicKey.default);

  return (
    <div>
      <div className="navbar">
        <Link href="/" className="brand">
          <span className="dot" />
          ChainTrace
        </Link>
        <Link href="/" style={{ color: "#c9c7bf", fontSize: 13 }}>
          ← Back to dashboard
        </Link>
      </div>
      <div className="page layout-split">
        <div className="panel-narrow" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card">
            <div className="mono" style={{ fontSize: 13, color: "var(--muted-2)", marginBottom: 6 }}>
              Batch {shortBatchId(id)}
            </div>
            <StatusBadge status={batch.status} />
          </div>

          <div className="card">
            <div className="section-title" style={{ marginBottom: 16 }}>
              Batch fields
            </div>
            <div className="field-grid">
              <div>
                <div className="section-sub" style={{ marginBottom: 4 }}>
                  Source type
                </div>
                <div style={{ fontWeight: 600 }}>{sourceTypeLabel(batch.sourceType)}</div>
              </div>
              <div className="span-2">
                <div className="section-sub" style={{ marginBottom: 4 }}>
                  Registered by
                </div>
                <div className="mono" style={{ fontWeight: 600 }}>
                  {shortWallet(batch.source)}
                </div>
              </div>
              <div className="span-2">
                <div className="section-sub" style={{ marginBottom: 4 }}>
                  Registered at
                </div>
                <div>{formatTimestamp(batch.createdAt)}</div>
              </div>
              {isReceived ? (
                <>
                  <div className="span-2">
                    <div className="section-sub" style={{ marginBottom: 4 }}>
                      Received by
                    </div>
                    <div className="mono" style={{ fontWeight: 600 }}>
                      {shortWallet(batch.receivedBy)}
                    </div>
                  </div>
                  <div className="span-2">
                    <div className="section-sub" style={{ marginBottom: 4 }}>
                      Delivered at
                    </div>
                    <div>{formatTimestamp(batch.deliveredAt)}</div>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="card">
            <div className="section-title" style={{ marginBottom: 16 }}>
              Products in this batch
            </div>
            <table>
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
                    <td className="mono">{products[i]?.skuCode ?? "—"}</td>
                    <td>{products[i]?.name ?? "—"}</td>
                    <td>{item.quantity.toString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel-wide card">
          <div className="section-title" style={{ marginBottom: 20 }}>
            Movement timeline
          </div>
          <MovementTimeline movements={movements} batch={batch} />
        </div>
      </div>
    </div>
  );
}
