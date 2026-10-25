import type { Metadata } from "next";

import { fetchAllBatches } from "@/lib/accounts";
import { requireAdmin } from "@/lib/guard";
import { BatchTable } from "@/components/BatchTable";
import { CardHeader } from "@/components/CardHeader";
import { PageHeader, Stats } from "@/components/PageHeader";

import { GrantRoleForm } from "./GrantRoleForm";
import { RevokeRoleForm } from "./RevokeRoleForm";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireAdmin();
  const batches = await fetchAllBatches();
  const inTransit = batches.filter(({ account }) => "inTransit" in account.status).length;
  const delivered = batches.filter(({ account }) => "delivered" in account.status).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Admin"
        title="Admin console"
        description="Decide who can act on the chain, and monitor every batch as it moves."
      />

      <Stats
        items={[
          { label: "Total batches", value: batches.length, tone: "cyan" },
          { label: "In transit", value: inTransit, tone: "amber" },
          { label: "Delivered", value: delivered, tone: "accent" },
        ]}
      />

      <div className="layout-split">
        <div className="stack">
          <div className="card">
            <CardHeader title="Grant role" call="grant_role(wallet, role)" />
            <GrantRoleForm />
          </div>
          <div className="card">
            <CardHeader title="Revoke role" call="revoke_role(wallet, role)" />
            <RevokeRoleForm />
          </div>
        </div>
        <div className="card panel-wide">
          <CardHeader title="All batches" description="Every registered batch and its current status." />
          <BatchTable batches={batches} showSource />
        </div>
      </div>
    </div>
  );
}
