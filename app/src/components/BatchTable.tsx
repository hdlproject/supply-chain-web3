import Link from "next/link";

import type { BatchEntry } from "@/lib/accounts";
import { batchIdToHex, shortBatchId } from "@/lib/batch-id";
import { sourceTypeLabel } from "@/lib/format";

import { AddressChip } from "./AddressChip";
import { ArrowRightIcon } from "./icons";
import { StatusBadge } from "./StatusBadge";

export function BatchTable({
  batches,
  showSource,
}: {
  batches: BatchEntry[];
  showSource: boolean;
}) {
  if (batches.length === 0) {
    return <div className="empty-state">No batches yet.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="table-responsive">
        <thead>
          <tr>
            <th>Batch ID</th>
            <th>Products</th>
            <th>Source type</th>
            {showSource ? <th>Registered by</th> : null}
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
                <td data-label="Source type">{sourceTypeLabel(account.sourceType)}</td>
                {showSource ? (
                  <td data-label="Registered by">
                    <AddressChip address={account.source.toBase58()} label="Registered by" />
                  </td>
                ) : null}
                <td data-label="Status">
                  <StatusBadge status={account.status} />
                </td>
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
  );
}
