import { describe, expect, it } from "vitest";

import { planLineItems, type ProductRow } from "./build-register-batch-instructions";

describe("planLineItems", () => {
  const existing = new Set(["EXISTING-SKU"]);

  it("marks a row referencing an already-catalogued SKU as not-new", () => {
    const rows: ProductRow[] = [{ skuCode: "EXISTING-SKU", name: "", quantity: "10" }];
    const plan = planLineItems(rows, existing);
    expect(plan.items).toEqual([{ index: 0, skuCode: "EXISTING-SKU", quantity: "10" }]);
    expect(plan.newProducts).toEqual([]);
  });

  it("marks a row referencing an unknown SKU as new, carrying its name", () => {
    const rows: ProductRow[] = [{ skuCode: "BRAND-NEW", name: "Brand New Thing", quantity: "5" }];
    const plan = planLineItems(rows, existing);
    expect(plan.items).toEqual([{ index: 0, skuCode: "BRAND-NEW", quantity: "5" }]);
    expect(plan.newProducts).toEqual([{ skuCode: "BRAND-NEW", name: "Brand New Thing" }]);
  });

  it("de-duplicates the same new SKU appearing in two rows of one submission", () => {
    const rows: ProductRow[] = [
      { skuCode: "DUPLICATE-NEW", name: "First Lot", quantity: "1" },
      { skuCode: "DUPLICATE-NEW", name: "Second Lot Same Sku", quantity: "2" },
    ];
    const plan = planLineItems(rows, existing);
    expect(plan.items).toHaveLength(2);
    expect(plan.newProducts).toEqual([{ skuCode: "DUPLICATE-NEW", name: "First Lot" }]);
  });

  it("rejects an empty row list", () => {
    expect(() => planLineItems([], existing)).toThrow(/at least one/i);
  });

  it("rejects a row with a blank sku code", () => {
    const rows: ProductRow[] = [{ skuCode: "  ", name: "x", quantity: "1" }];
    expect(() => planLineItems(rows, existing)).toThrow(/sku code/i);
  });

  it("rejects a row with a non-numeric quantity", () => {
    const rows: ProductRow[] = [{ skuCode: "SKU", name: "x", quantity: "abc" }];
    expect(() => planLineItems(rows, existing)).toThrow(/quantity/i);
  });

  it("rejects a row with an unknown sku code and a blank name", () => {
    const rows: ProductRow[] = [{ skuCode: "BRAND-NEW", name: "  ", quantity: "1" }];
    expect(() => planLineItems(rows, existing)).toThrow(/name is required/i);
  });
});
