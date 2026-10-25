import { formatTimestamp, shortWalletString, sourceTypeLabel } from "@/lib/format";

// Plain-data shapes (base58 strings, unix-second numbers) rather than
// PublicKey/BN instances, so this component works from both a server
// page (converting at the call site) and a client component receiving
// already-serialized props across the server/client boundary -- a
// PublicKey/BN instance loses its prototype methods crossing that
// boundary, a plain string/number doesn't.
export type TimelineMovement = {
  carrier: string;
  fromLocation: string;
  toLocation: string;
  vehicleId: string | null;
  timestamp: number;
};

export type TimelineBatch = {
  source: string;
  sourceType: object;
  createdAt: number;
  receivedBy: string | null;
  deliveredAt: number | null;
};

export function MovementTimeline({
  movements,
  batch,
  carrierColors,
}: {
  movements: TimelineMovement[];
  batch: TimelineBatch;
  // Optional: maps a carrier's base58 wallet to a CSS color, so a batch
  // serviced by several different carriers visually distinguishes who
  // did which leg. Omit for the single-carrier-per-wallet-is-obvious case
  // (e.g. a carrier reviewing just their own entries).
  carrierColors?: Map<string, string>;
}) {
  const sourceColor = carrierColors?.get(batch.source);
  const isReceived = batch.receivedBy !== null && batch.deliveredAt !== null;

  return (
    <div className={`timeline${isReceived ? " is-finished" : ""}`}>
      <div className="timeline-item">
        <div className="timeline-dot" style={sourceColor ? { background: sourceColor } : undefined} />
        <div className="timeline-route">
          Registered by {shortWalletString(batch.source)} ({sourceTypeLabel(batch.sourceType)})
        </div>
        {sourceColor ? (
          <div className="timeline-meta">
            <span className="chip" style={{ borderLeft: `3px solid ${sourceColor}` }}>
              source {shortWalletString(batch.source)}
            </span>
          </div>
        ) : null}
        <div className="timeline-meta">{formatTimestamp(batch.createdAt)}</div>
      </div>
      {movements.map((movement, index) => {
        const color = carrierColors?.get(movement.carrier);
        return (
          <div className="timeline-item" key={index}>
            <div
              className={`timeline-dot${index === movements.length - 1 && !isReceived ? " pending" : ""}`}
              style={color ? { background: color } : undefined}
            />
            <div className="timeline-route">
              {movement.fromLocation} → {movement.toLocation}
            </div>
            <div className="timeline-meta">
              <span className="chip" style={color ? { borderLeft: `3px solid ${color}` } : undefined}>
                courier {shortWalletString(movement.carrier)}
              </span>
              {movement.vehicleId ? <span className="chip">vehicle {movement.vehicleId}</span> : null}
            </div>
            <div className="timeline-meta">{formatTimestamp(movement.timestamp)}</div>
          </div>
        );
      })}
      {isReceived && batch.receivedBy && batch.deliveredAt !== null ? (
        <div className="timeline-item timeline-finish">
          <div className="finish-marker" aria-hidden="true" />
          <div className="finish-card">
            <div className="finish-banner" aria-hidden="true" />
            <div className="finish-body">
              <div className="finish-eyebrow">Finish line</div>
              <div className="timeline-route">Received at restaurant</div>
              <div className="timeline-meta">
                <span className="chip">restaurant {shortWalletString(batch.receivedBy)}</span>
              </div>
              <div className="timeline-meta">{formatTimestamp(batch.deliveredAt)}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="timeline-item timeline-finish is-pending">
          <div className="finish-marker" aria-hidden="true" />
          <div className="finish-card">
            <div className="finish-banner" aria-hidden="true" />
            <div className="finish-body">
              <div className="finish-eyebrow">Finish line</div>
              <div className="timeline-route">Awaiting receipt at restaurant</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
