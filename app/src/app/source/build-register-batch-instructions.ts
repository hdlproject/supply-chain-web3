export type ProductRow = { skuCode: string; name: string; quantity: string };

export type LineItemPlanEntry = { index: number; skuCode: string; quantity: string };
export type NewProduct = { skuCode: string; name: string };
export type LineItemPlan = { items: LineItemPlanEntry[]; newProducts: NewProduct[] };

// Decides which rows reference a SKU that doesn't exist in the catalog
// fetched at submission time (and so need their own register_product call
// bundled into the same transaction), de-duplicating repeated new codes
// within one submission -- pure so it's cheap to test directly, separate
// from actually building/sending the transaction.
export function planLineItems(rows: ProductRow[], existingSkuCodes: Set<string>): LineItemPlan {
  if (rows.length === 0) {
    throw new Error("A batch needs at least one product.");
  }

  const items: LineItemPlanEntry[] = [];
  const newProducts: NewProduct[] = [];
  const seenNewCodes = new Set<string>();

  rows.forEach((row, index) => {
    const skuCode = row.skuCode.trim();
    if (!skuCode) {
      throw new Error(`Row ${index + 1}: SKU code is required.`);
    }
    if (!/^\d+$/.test(row.quantity.trim())) {
      throw new Error(`Row ${index + 1}: quantity must be a whole number.`);
    }
    items.push({ index, skuCode, quantity: row.quantity.trim() });

    if (!existingSkuCodes.has(skuCode) && !seenNewCodes.has(skuCode)) {
      seenNewCodes.add(skuCode);
      newProducts.push({ skuCode, name: row.name.trim() });
    }
  });

  return { items, newProducts };
}
