import { fetchAllBatches } from "@/lib/accounts";
import { requireAdmin } from "@/lib/guard";
import { BatchTable } from "@/components/BatchTable";
import { NavBar } from "@/components/NavBar";

import { GrantRoleForm } from "./GrantRoleForm";
import { RevokeRoleForm } from "./RevokeRoleForm";

export default async function AdminPage() {
  const session = await requireAdmin();
  const batches = await fetchAllBatches();

  return (
    <div>
      <NavBar roles={session.roles} activeRole="Admin" wallet={session.wallet} />
      <div className="page layout-split">
        <div className="panel-narrow" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card">
            <div className="section-title">Grant role</div>
            <div className="section-sub">grant_role(wallet, role)</div>
            <GrantRoleForm />
          </div>
          <div className="card">
            <div className="section-title">Revoke role</div>
            <div className="section-sub">revoke_role(wallet, role)</div>
            <RevokeRoleForm />
          </div>
        </div>
        <div className="panel-wide card">
          <div className="section-title">All batches</div>
          <div className="section-sub">
            Admin-wide monitoring — every registered batch &amp; its status
          </div>
          <BatchTable batches={batches} showSource />
        </div>
      </div>
    </div>
  );
}
