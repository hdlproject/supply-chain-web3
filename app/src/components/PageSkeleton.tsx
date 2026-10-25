// Shown by each data-heavy route's loading.tsx while its server component
// waits on the chain. Because the header lives in the root layout it stays
// put, so navigation reads as "content loading" rather than a full reload.
export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <div className="page-header">
        <div style={{ width: "100%" }}>
          <div className="skeleton" style={{ height: 12, width: 72, marginBottom: 14 }} />
          <div className="skeleton" style={{ height: 34, width: "min(320px, 70%)" }} />
          <div className="skeleton" style={{ height: 16, width: "min(460px, 90%)", marginTop: 14 }} />
        </div>
      </div>

      <div className="stats">
        {[0, 1, 2].map((i) => (
          <div key={i} className="stat">
            <div className="skeleton" style={{ height: 12, width: 70 }} />
            <div className="skeleton" style={{ height: 30, width: 52, marginTop: 12 }} />
          </div>
        ))}
      </div>

      <div className="layout-split">
        <div className="card">
          <div className="skeleton" style={{ height: 20, width: 140, marginBottom: 22 }} />
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 42, marginBottom: 16 }} />
          ))}
          <div className="skeleton" style={{ height: 44 }} />
        </div>
        <div className="card">
          <div className="skeleton" style={{ height: 20, width: 180, marginBottom: 22 }} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 44, marginBottom: 12 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
