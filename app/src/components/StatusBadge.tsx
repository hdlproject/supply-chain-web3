import { batchStatusLabel, batchStatusSlug } from "@/lib/format";

export function StatusBadge({ status }: { status: object }) {
  return <span className={`badge badge-${batchStatusSlug(status)}`}>{batchStatusLabel(status)}</span>;
}
