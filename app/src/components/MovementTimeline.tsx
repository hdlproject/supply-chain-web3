import type { BatchAccountDecoded, MovementRecord } from "@/lib/accounts";
import { formatTimestamp, shortWallet, sourceTypeLabel } from "@/lib/format";

export function MovementTimeline({
  movements,
  batch,
}: {
  movements: MovementRecord[];
  batch: BatchAccountDecoded;
}) {
  return (
    <div className="timeline">
      <div className="timeline-line" />
      <div className="timeline-item">
        <div className="timeline-dot" />
        <div className="timeline-route">
          Registered by {shortWallet(batch.source)} ({sourceTypeLabel(batch.sourceType)})
        </div>
        <div className="timeline-meta">{formatTimestamp(batch.createdAt)}</div>
      </div>
      {movements.map((movement, index) => (
        <div className="timeline-item" key={index}>
          <div className={`timeline-dot${index === movements.length - 1 ? " pending" : ""}`} />
          <div className="timeline-route">
            {movement.fromLocation} → {movement.toLocation}
          </div>
          {movement.courierId && movement.vehicleId ? (
            <div className="timeline-meta">
              <span className="chip">courier {movement.courierId}</span>
              <span className="chip">vehicle {movement.vehicleId}</span>
            </div>
          ) : null}
          <div className="timeline-meta">{formatTimestamp(movement.timestamp)}</div>
        </div>
      ))}
    </div>
  );
}
