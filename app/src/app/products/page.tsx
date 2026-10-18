import { fetchAllProducts } from "@/lib/accounts";
import { requireSession } from "@/lib/guard";
import { NavBar } from "@/components/NavBar";

import { RegisterProductForm } from "./RegisterProductForm";

export default async function ProductsPage() {
  const session = await requireSession();
  const products = await fetchAllProducts();

  return (
    <div>
      <NavBar roles={session.roles} activeRole={session.roles[0]} wallet={session.wallet} />
      <div className="page layout-split">
        <div className="panel-narrow card">
          <div className="section-title">Register product</div>
          <div className="section-sub">register_product(sku_code, name)</div>
          <RegisterProductForm />
        </div>
        <div className="panel-wide card">
          <div className="section-title">Product catalog</div>
          <div className="section-sub">Shared across every account — pick any of these when building a batch</div>
          {products.length === 0 ? (
            <div className="empty-state">No products registered yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>SKU code</th>
                  <th>Name</th>
                </tr>
              </thead>
              <tbody>
                {products.map(({ publicKey, account }) => (
                  <tr key={publicKey.toBase58()}>
                    <td className="mono">{account.skuCode}</td>
                    <td>{account.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
