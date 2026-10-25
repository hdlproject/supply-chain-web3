import Link from "next/link";

import { ArrowLeftIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <div className="card" style={{ textAlign: "center", padding: "40px 28px" }}>
        <div className="eyebrow" style={{ justifyContent: "center" }}>
          404
        </div>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Nothing here</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 22 }}>
          That page or batch doesn&apos;t exist — or it isn&apos;t on this cluster.
        </p>
        <Link href="/" className="btn btn-outline">
          <ArrowLeftIcon small /> Back to dashboard
        </Link>
      </div>
    </div>
  );
}
