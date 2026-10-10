import { fetchBatchesBySource } from "@/lib/accounts";
import { requireRole } from "@/lib/guard";
import { BatchTable } from "@/components/BatchTable";
import { NavBar } from "@/components/NavBar";

import { RegisterBatchForm } from "./RegisterBatchForm";

export default async function SourcePage() {
  const session = await requireRole("Source");
  const batches = await fetchBatchesBySource(session.wallet);

  return (
    <div>
      <NavBar roles={session.roles} activeRole="Source" wallet={session.wallet} />
      <div className="page layout-split">
        <div className="panel-narrow card">
          <div className="section-title">Register batch</div>
          <div className="section-sub">register_batch(id, name, qty, source_type)</div>
          <RegisterBatchForm />
        </div>
        <div className="panel-wide card">
          <div className="section-title">Batches you&apos;ve registered</div>
          <div className="section-sub">Only this account&apos;s registrations</div>
          <BatchTable batches={batches} showSource={false} />
        </div>
      </div>
    </div>
  );
}
