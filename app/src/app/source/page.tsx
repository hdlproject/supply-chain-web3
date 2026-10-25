import type { Metadata } from "next";

import { fetchAllProducts, fetchBatchesBySource } from "@/lib/accounts";
import { requireRole } from "@/lib/guard";
import { BatchTable } from "@/components/BatchTable";
import { CardHeader } from "@/components/CardHeader";
import { PageHeader, Stats } from "@/components/PageHeader";

import { RegisterBatchForm } from "./RegisterBatchForm";

export const metadata: Metadata = { title: "Source" };

export default async function SourcePage() {
  const session = await requireRole("Source");
  const [batches, products] = await Promise.all([
    fetchBatchesBySource(session.wallet),
    fetchAllProducts(),
  ]);
  const inTransit = batches.filter(({ account }) => "inTransit" in account.status).length;
  const delivered = batches.filter(({ account }) => "delivered" in account.status).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Source"
        title="Source dashboard"
        description="Register the batches you send out, then follow them downstream."
      />

      <Stats
        items={[
          { label: "Your batches", value: batches.length, tone: "cyan" },
          { label: "In transit", value: inTransit, tone: "amber" },
          { label: "Delivered", value: delivered, tone: "accent" },
        ]}
      />

      <div className="layout-split">
        <div className="card">
          <CardHeader title="Register batch" call="register_batch(…)" />
          <RegisterBatchForm
            products={products.map((p) => ({ skuCode: p.account.skuCode, name: p.account.name }))}
          />
        </div>
        <div className="card panel-wide">
          <CardHeader title="Your batches" description="Only batches registered by this wallet." />
          <BatchTable batches={batches} showSource={false} />
        </div>
      </div>
    </div>
  );
}
