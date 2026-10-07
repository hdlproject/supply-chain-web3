import { describe, expect, it } from "vitest";

import { DEMO_ACCOUNTS } from "./demo-accounts";

describe("demo account roster", () => {
  it("exposes exactly the four PRD-required demo roles", () => {
    expect(DEMO_ACCOUNTS.map((account) => account.role).sort()).toEqual(
      ["Admin", "Carrier", "Restaurant", "Source"].sort(),
    );
  });

  it("gives each role a distinct key file", () => {
    const keyFiles = DEMO_ACCOUNTS.map((account) => account.keyFile);
    expect(new Set(keyFiles).size).toBe(keyFiles.length);
  });
});
