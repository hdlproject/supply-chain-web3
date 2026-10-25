import { describe, expect, it } from "vitest";

import { clusterLabel } from "./cluster";

describe("clusterLabel", () => {
  it("recognizes local validators however they're addressed", () => {
    expect(clusterLabel("http://127.0.0.1:8899")).toBe("Localnet");
    expect(clusterLabel("http://localhost:8899")).toBe("Localnet");
    expect(clusterLabel("http://0.0.0.0:8899")).toBe("Localnet");
  });

  it("recognizes the public clusters", () => {
    expect(clusterLabel("https://api.devnet.solana.com")).toBe("Devnet");
    expect(clusterLabel("https://api.testnet.solana.com")).toBe("Testnet");
    expect(clusterLabel("https://api.mainnet-beta.solana.com")).toBe("Mainnet");
  });

  it("falls back to a generic label for unknown providers", () => {
    expect(clusterLabel("https://rpc.example.com/key")).toBe("Custom RPC");
  });

  it("does not mistake a host that merely contains 'localhost' for a local one", () => {
    expect(clusterLabel("https://localhost.evil.example")).toBe("Custom RPC");
  });
});
