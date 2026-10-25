import type { Metadata } from "next";

import { fetchAllProducts } from "@/lib/accounts";
import { requireSession } from "@/lib/guard";
import { CardHeader } from "@/components/CardHeader";
import { PageHeader, Stats } from "@/components/PageHeader";

import { RegisterProductForm } from "./RegisterProductForm";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage() {
  await requireSession();
  const products = await fetchAllProducts();

  return (
    <div className="page">
      <PageHeader
        eyebrow="Catalog"
        title="Product catalog"
        description="A shared list of SKUs. Anyone can add one; every batch picks its products from here."
      />

      <Stats items={[{ label: "Registered SKUs", value: products.length, tone: "violet" }]} />

      <div className="layout-split">
        <div className="card">
          <CardHeader title="Register product" call="register_product(sku, name)" />
          <RegisterProductForm existingSkuCodes={products.map(({ account }) => account.skuCode)} />
        </div>
        <div className="card panel-wide">
          <CardHeader title="Catalog" description="Shared across every account." />
          {products.length === 0 ? (
            <div className="empty-state">No products registered yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="table-responsive">
                <thead>
                  <tr>
                    <th>SKU code</th>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(({ publicKey, account }) => (
                    <tr key={publicKey.toBase58()}>
                      <td data-label="SKU code" className="mono">
                        {account.skuCode}
                      </td>
                      <td data-label="Name">{account.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
