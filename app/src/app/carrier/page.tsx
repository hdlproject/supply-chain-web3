import type { Metadata } from "next";
import { PublicKey } from "@solana/web3.js";

import {
  fetchAllBatches,
  fetchBatchByAddress,
  fetchMovementsByCarrier,
  fetchMovementsForBatch,
} from "@/lib/accounts";
import { batchIdToHex, shortBatchId } from "@/lib/batch-id";
import { carrierColorMap } from "@/lib/carrier-colors";
import { requireRole } from "@/lib/guard";
import { PageHeader, Stats } from "@/components/PageHeader";

import { BatchRoutesPanel, type SerializedRoute } from "./BatchRoutesPanel";

export const metadata: Metadata = { title: "Carrier" };

export default async function CarrierPage() {
  const session = await requireRole("Carrier");
  const [allBatches, myMovements] = await Promise.all([
    fetchAllBatches(),
    fetchMovementsByCarrier(session.wallet),
  ]);

  const eligibleBatches = allBatches
    .filter((entry) => !("delivered" in entry.account.status))
    .map((entry) => {
      const hexId = batchIdToHex(Uint8Array.from(entry.account.batchId));
      return { value: hexId, label: `${shortBatchId(hexId)} — ${entry.account.lineItemCount} product${entry.account.lineItemCount === 1 ? "" : "s"}` };
    });

  // Every batch this carrier has logged at least one movement on. A batch
  // can be handed off between several carriers, so we show each one's
  // FULL route here (every carrier's legs, not just this wallet's) --
  // otherwise the route has gaps that look broken rather than "someone
  // else did that leg". Safe to show: every Movement/Batch account here
  // is already public on-chain data, same as the batch detail page.
  const touchedBatchAddresses = [...new Set(myMovements.map((m) => m.account.batch.toBase58()))];
  const batchRoutes = await Promise.all(
    touchedBatchAddresses.map(async (address) => {
      const batchPubkey = new PublicKey(address);
      const [batch, movements] = await Promise.all([
        fetchBatchByAddress(batchPubkey),
        fetchMovementsForBatch(batchPubkey),
      ]);
      if (!batch) return null;
      const isReceived = !batch.receivedBy.equals(PublicKey.default);
      const route: SerializedRoute = {
        hexId: batchIdToHex(Uint8Array.from(batch.batchId)),
        status: batch.status,
        source: batch.source.toBase58(),
        sourceType: batch.sourceType,
        createdAt: batch.createdAt.toNumber(),
        receivedBy: isReceived ? batch.receivedBy.toBase58() : null,
        deliveredAt: isReceived ? batch.deliveredAt.toNumber() : null,
        movements: movements.map((m) => ({
          carrier: m.carrier.toBase58(),
          fromLocation: m.fromLocation,
          toLocation: m.toLocation,
          vehicleId: m.vehicleId ?? null,
          timestamp: m.timestamp.toNumber(),
        })),
      };
      return route;
    }),
  );
  const routes = batchRoutes.filter((route): route is SerializedRoute => route !== null);

  // One color map across every route shown, so the same carrier wallet
  // always gets the same color regardless of which batch it shows up on.
  const colors = carrierColorMap(routes.flatMap((route) => route.movements.map((m) => m.carrier)));

  return (
    <div className="page">
      <PageHeader
        eyebrow="Carrier"
        title="Carrier dashboard"
        description="Log each leg of a batch's journey and follow the full route, including other carriers' legs."
      />

      <Stats
        items={[
          { label: "Open batches", value: eligibleBatches.length, tone: "cyan" },
          { label: "Movements logged", value: myMovements.length, tone: "accent" },
          { label: "Batches touched", value: routes.length, tone: "violet" },
        ]}
      />

      <BatchRoutesPanel batches={eligibleBatches} routes={routes} colorEntries={[...colors.entries()]} />
    </div>
  );
}
