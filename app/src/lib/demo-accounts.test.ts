import { describe, expect, it } from "vitest";

import { roleHomePath } from "./demo-accounts";

describe("roleHomePath", () => {
  it("maps each role to its dashboard path", () => {
    expect(roleHomePath("Admin")).toBe("/admin");
    expect(roleHomePath("Source")).toBe("/source");
    expect(roleHomePath("Carrier")).toBe("/carrier");
    expect(roleHomePath("Restaurant")).toBe("/restaurant");
  });
});
