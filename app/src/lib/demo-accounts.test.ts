import { describe, expect, it } from "vitest";

import { DEMO_ACCOUNTS, findDemoAccount, verifyPassword } from "./demo-accounts";

describe("demo account credentials", () => {
  it("exposes exactly the four PRD-required demo roles", () => {
    expect(DEMO_ACCOUNTS.map((account) => account.role).sort()).toEqual(
      ["Admin", "Carrier", "Restaurant", "Source"].sort(),
    );
  });

  it("finds an account by username", () => {
    expect(findDemoAccount("admin")?.role).toBe("Admin");
    expect(findDemoAccount("nope")).toBeUndefined();
  });

  it("verifies the correct password and rejects a wrong one", () => {
    const account = findDemoAccount("source")!;
    expect(verifyPassword(account, "source-demo-pass")).toBe(true);
    expect(verifyPassword(account, "wrong-password")).toBe(false);
  });
});
