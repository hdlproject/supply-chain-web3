import Link from "next/link";

import type { BatchEntry } from "@/lib/accounts";
import { batchIdToHex, shortBatchId } from "@/lib/batch-id";
import { sourceTypeLabel } from "@/lib/format";

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
    <table>
      <thead>
        <tr>
          <th>Batch ID</th>
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
              <td className="mono">{shortBatchId(hexId)}</td>
              <td>{sourceTypeLabel(account.sourceType)}</td>
              {showSource ? (
                <td className="mono">
                  {account.source.toBase58().slice(0, 4)}…{account.source.toBase58().slice(-4)}
                </td>
              ) : null}
              <td>
                <StatusBadge status={account.status} />
              </td>
              <td>
                <Link href={`/batch/${hexId}`}>View →</Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
