"use client";

import dynamic from "next/dynamic";

// See WalletConnectButtonImpl.tsx for the component itself and why it's
// SSR-disabled (wallet state depends on localStorage, unavailable on the
// server and the client's very first render alike).
export const WalletConnectButton = dynamic(
  async () => (await import("./WalletConnectButtonImpl")).WalletConnectButtonImpl,
  { ssr: false },
);
