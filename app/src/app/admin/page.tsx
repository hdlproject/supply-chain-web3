import { fetchAllBatches } from "@/lib/accounts";
import { requireAdmin } from "@/lib/guard";
import { BatchTable } from "@/components/BatchTable";
import { NavBar } from "@/components/NavBar";

import { AssignRoleForm } from "./AssignRoleForm";

export default async function AdminPage() {
  const session = await requireAdmin();
  const batches = await fetchAllBatches();

  return (
    <div>
      <NavBar role="Admin" wallet={session.wallet} />
      <div className="page layout-split">
        <div className="panel-narrow card">
          <div className="section-title">Assign role</div>
          <div className="section-sub">assign_role(wallet, role)</div>
          <AssignRoleForm />
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
