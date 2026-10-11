import { AnchorError } from "@coral-xyz/anchor";
import { describe, expect, it } from "vitest";

import { describeTxError } from "./tx-error";

describe("describeTxError", () => {
  it("extracts just the #[msg(...)] text from an AnchorError", () => {
    const error = new AnchorError(
      { code: "RoleNotHeld", number: 6004 },
      "Wallet does not hold the role being revoked",
      ["Program log: AnchorError thrown in revoke_role.rs:32. Error Code: RoleNotHeld. Error Number: 6004. Error Message: Wallet does not hold the role being revoked."],
      [],
    );
    expect(describeTxError(error, "fallback")).toBe("Wallet does not hold the role being revoked");
  });

  it("passes through a short plain Error message", () => {
    expect(describeTxError(new Error("User rejected the request."), "fallback")).toBe(
      "User rejected the request.",
    );
  });

  it("falls back for an Error whose message is a raw simulation-log dump", () => {
    const error = new Error("Simulation failed.\nProgram log: some internal trace\nProgram returned error");
    expect(describeTxError(error, "fallback")).toBe("fallback");
  });

  it("falls back for a non-Error value", () => {
    expect(describeTxError("not an error", "fallback")).toBe("fallback");
  });
});
